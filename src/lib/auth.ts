import passport from 'passport';
import { Express, NextFunction, Request, Response } from 'express';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import session from 'express-session';
import cors from 'cors';
// import { PGStore } from 'connect-pg-simple';
import { default as connectPgSimple } from 'connect-pg-simple';
const PGStore = connectPgSimple(session);

import { getDbClient, getPool, getUserByEmail } from './db';
import { SessionUser } from '../express-session.extensions';

export function addAuthRoutes(app: Express) {
  app.use(
    session({
      store: new PGStore({
        pool: getPool(),
        tableName: 'session',
      }),
      secret: process.env.SESSION_SECRET as string,
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false }, // use 'secure: true' for production to ensure the cookie is sent over HTTPS
    })
  );

  app.use(
    cors({
      origin: 'http://localhost:3000',
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
        `http://localhost:3000/redirect?name=${encodeURIComponent(
          req.session.user.name
        )}` +
        (req.session.user.profilePic
          ? `&pic=${encodeURIComponent(req.session.user.profilePic as string)}`
          : '');
      res.redirect(redirectUrl);
    }
  );

  app.post('/logout', (req, res) => {
    if (req.session.user) {
      const tokenId = (req.session.user as SessionUser).id;

      req.session.destroy(async (err) => {
        if (err) {
          res.status(500).send({ loggedOut: false });
        } else {
          const client = await getDbClient();
          // Using req.user.id to get the oauth token id
          await client.query('DELETE FROM oauth_tokens WHERE id = $1', [
            tokenId,
          ]);
          res.clearCookie('connect.sid'); // If you're using the default session cookie name
          res.send({ loggedOut: true });
        }
      });
    } else {
      res.send({ loggedOut: true });
    }
  });
  app.post('/logout', (req, res) => {
    req.session.destroy(async (err) => {
      if (err) {
        const client = await getDbClient();
        // await client.query('
        // ')
        res.status(500).send({ loggedOut: false });
      } else {
        res.clearCookie('connect.sid'); // If you're using the default session cookie name
        res.send({ loggedOut: true });
      }
    });
  });
}

export function ensureAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (req.session.user) {
    // User is authenticated, proceed to the next middleware function or the route handler
    next();
  } else {
    // User is not authenticated, send an error response
    res.status(401).json({ message: 'Unauthorized' });
  }
}

export function makeGoogleStrategy() {
  return new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_ID as string,
      clientSecret: process.env.GOOGLE_SECRET as string,
      callbackURL: 'http://localhost:3001/auth/google/callback',
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
            `INSERT INTO tenants (name) VALUES ($1) RETURNING id`,
            ['Your Organization']
          );
          const tenantId = tenantRes.rows[0].id;
          const userRes = await client.query(
            `INSERT INTO users (name, email, selected_tenant_id) VALUES ($1, $2, $3) RETURNING id`,
            [profile.name, profile.emails[0], tenantId]
          );
          const userId = userRes.rows[0].id;
          await client.query(
            `INSERT INTO user_tenants (user_id, tenant_id) VALUES ($1, $2)`,
            [userId, tenantId]
          );
          tokenId = await createTokenRecord(userId);
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
        done(e as Error);
      } finally {
        client.release();
      }
    }
  );
}
