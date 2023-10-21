import passport from 'passport';
import { Express, NextFunction, Request, Response } from 'express';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import session from 'express-session';
import cors from 'cors';
import { default as connectPgSimple } from 'connect-pg-simple';
const PGStore = connectPgSimple(session);

import {
  withDbClient,
  getPool,
  getUserByEmail,
  getDbClient,
  createConversation,
} from './db';
import { SessionUser } from '../express-session.extensions';
import { parse } from 'cookie';
import { logger } from './log';

export const verifyClient =
  (sessionMiddleware: any) => async (info: any, done: any) => {
    const req = info.req;
    const cookies = parse(req.headers.cookie || '');
    const sid = cookies['connect.sid'];

    if (!sid) {
      done(false, 401, 'Unauthorized');
      return;
    }
    sessionMiddleware(req, {} as any, async () => {
      if (!req.session || !req.session.user) {
        done(false, 401, 'Unauthorized');
        return;
      }
      const user = req.session.user as SessionUser;

      const oauthTokenQuery = 'SELECT user_id FROM oauth_tokens WHERE id = $1';
      const oauthTokenValues = [user.id];
      const oauthResult = await withDbClient(
        async (c) => await c.query(oauthTokenQuery, oauthTokenValues)
      );

      if (oauthResult.rows.length === 0) {
        done(false, 401, 'Unauthorized');
        return;
      }

      const userId = oauthResult.rows[0].user_id;
      req.user_id = userId;

      const userQuery = 'SELECT selected_tenant_id FROM users WHERE id = $1';
      const userValues = [userId];
      const userResult = await withDbClient(
        async (c) => await c.query(userQuery, userValues)
      );

      if (userResult.rows.length === 0) {
        done(false, 401, 'Unauthorized');
        return;
      }

      req.tenant_id = userResult.rows[0].selected_tenant_id;
      done(true);
    });
  };

export function getSessionMiddleWare() {
  return session({
    store: new PGStore({
      pool: getPool(),
      tableName: 'session',
    }),
    secret: process.env.SESSION_SECRET as string,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // use 'secure: true' for production to ensure the cookie is sent over HTTPS
  });
}

export function addAuthRoutes(app: Express, sessionMiddleware: any) {
  console.log('ORIGIN URI', process.env.ORIGIN_URI);
  app.use(sessionMiddleware);
  app.use(
    cors({
      origin: process.env.ORIGIN_URI,
      credentials: true, // to support cookies from the client
    })
  );
  // Configure Passport.js for Google OAuth
  passport.use(makeGoogleStrategy());

  // Initialize Passport.js
  app.use(passport.initialize());
  app.use(passport.session());

  // Passport.js requires these two methods for handling user serialization
  passport.serializeUser(function (user, done) {
    done(null, user);
  });
  passport.deserializeUser(function (user, done) {
    done(null, user as Express.User);
  });

  // Setup the Google OAuth routes
  app.get(
    '/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );

  app.get(
    '/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    function (req, res) {
      req.session.user = req.user as SessionUser;
      const redirectUrl =
        `${process.env.ORIGIN_URI}/redirect?name=${encodeURIComponent(
          req.session.user.name
        )}` +
        (req.session.user.profilePic
          ? `&pic=${encodeURIComponent(req.session.user.profilePic as string)}`
          : '');
      res.redirect(redirectUrl);
    }
  );

  app.get('/auth/check', authenticate, (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.post('/auth/logout', (req, res) => {
    if (req.session.user) {
      const tokenId = (req.session.user as SessionUser).id;

      req.session.destroy(async (err) => {
        if (err) {
          res.status(500).send({ loggedOut: false });
        } else {
          await withDbClient(async (c) => {
            await c.query('DELETE FROM oauth_tokens WHERE id = $1', [tokenId]);
          });

          res.clearCookie('connect.sid'); // If you're using the default session cookie name
          res.send({ loggedOut: true });
        }
      });
    } else {
      res.send({ loggedOut: true });
    }
  });
}

export function makeGoogleStrategy() {
  return new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_ID as string,
      clientSecret: process.env.GOOGLE_SECRET as string,
      callbackURL: process.env.AUTH_CALLBACK,
    },
    async function (accessToken, refreshToken, profile, done) {
      if (!profile.emails) {
        return done('No email');
      }
      const email = profile.emails[0].value;
      const client = await getDbClient();

      const createTokenRecord = async (userId: string) => {
        const tokenRes = await client.query(
          `INSERT INTO oauth_tokens (user_id, provider, provider_user_id, access_token, id_token, refresh_token, token_expiry) 
            VALUES ($1, $2, $3, $4, $5, $6, TO_TIMESTAMP($7)) RETURNING id`,
          [
            userId,
            profile.provider,
            profile.id,
            accessToken,
            null, // id_token is not provided by GoogleStrategy
            refreshToken,
            profile._json.exp, // Expiry time
          ]
        );
        return tokenRes.rows[0].id;
      };

      try {
        await client.query('BEGIN');
        let userId = await getUserByEmail(client, email);
        let tokenId = null;
        if (userId) {
          await client.query('DELETE FROM oauth_tokens WHERE user_id = $1', [
            userId,
          ]);
          tokenId = await createTokenRecord(userId);
        } else {
          const tenantRes = await client.query(
            `INSERT INTO tenants (name, credits) VALUES ($1, $2) RETURNING id`,
            ['Your Organization', 20000]
          );
          const tenantId = tenantRes.rows[0].id;
          const firstEmail = profile.emails[0];
          const name = profile.name
            ? profile.name.givenName || '' + profile.name.familyName
            : '';
          const userRes = await client.query(
            `INSERT INTO users (name, email, selected_tenant_id) VALUES ($1, $2, $3) RETURNING id`,
            [name, firstEmail.value, tenantId]
          );
          const userId = userRes.rows[0].id;
          await client.query(
            `INSERT INTO user_tenants (user_id, tenant_id) VALUES ($1, $2)`,
            [userId, tenantId]
          );
          tokenId = await createTokenRecord(userId);
          await createConversation(
            {
              model_id: 'gpt-4',
              temperature: 0.5,
              name: 'New',
              tenant_id: tenantId,
              user_id: userId,
            },
            client
          );
        }

        await client.query('COMMIT');
        const profilePic =
          profile.photos && profile.photos.length > 0
            ? profile.photos[0].value
            : undefined;
        done(null, {
          id: tokenId,
          name: profile.displayName,
          profilePic,
          email,
        });
      } catch (e) {
        await client.query('ROLLBACK');
        logger.error(e);
        done('Failed to login');
      } finally {
        client.release();
      }
    }
  );
}

const testHandler = async (req: Request, res: Response, next: NextFunction) => {
  if (req.headers['x-inject-user_id']) {
    try {
      req.user_id = req.headers['x-inject-user_id'] as string;
      req.tenant_id = req.headers['x-inject-tenant_id'] as string;
    } catch (err) {
      console.error('Failed to parse X-Inject-Req-Variables header:', err);
    }
  }
};

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (process.env.NODE_ENV == 'test') {
    testHandler(req, res, next);
    return next();
  }
  try {
    // Check if user exists on the session
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = req.session.user as SessionUser;
    const oauthTokenQuery = 'SELECT user_id FROM oauth_tokens WHERE id = $1';
    const oauthTokenValues = [user.id];
    const oauthResult = await withDbClient(
      async (c) => await c.query(oauthTokenQuery, oauthTokenValues)
    );

    // Check if user_id exists for the OAuth token
    if (oauthResult.rows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = oauthResult.rows[0].user_id;
    req.user_id = userId;

    // Fetch selected_tenant_id for the user
    const userQuery = 'SELECT selected_tenant_id FROM users WHERE id = $1';
    const userValues = [userId];
    const userResult = await withDbClient(
      async (c) => await c.query(userQuery, userValues)
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.tenant_id = userResult.rows[0].selected_tenant_id;

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
