"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeGoogleStrategy = exports.addAuthRoutes = void 0;
const passport_1 = __importDefault(require("passport"));
const passport_google_oauth20_1 = require("passport-google-oauth20");
const express_session_1 = __importDefault(require("express-session"));
const cors_1 = __importDefault(require("cors"));
// import { PGStore } from 'connect-pg-simple';
const connect_pg_simple_1 = __importDefault(require("connect-pg-simple"));
const PGStore = (0, connect_pg_simple_1.default)(express_session_1.default);
const db_1 = require("./db");
function addAuthRoutes(app) {
    app.use((0, express_session_1.default)({
        store: new PGStore({
            pool: (0, db_1.getPool)(),
            tableName: 'session',
        }),
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false }, // use 'secure: true' for production to ensure the cookie is sent over HTTPS
    }));
    app.use((0, cors_1.default)({
        origin: 'http://localhost:3000',
        credentials: true, // to support cookies from the client
    }));
    // Configure Passport.js for Google OAuth
    passport_1.default.use(makeGoogleStrategy());
    // Initialize Passport.js
    app.use(passport_1.default.initialize());
    app.use(passport_1.default.session());
    // Passport.js requires these two methods for handling user serialization
    passport_1.default.serializeUser(function (user, done) {
        done(null, user);
    });
    passport_1.default.deserializeUser(function (user, done) {
        done(null, user);
    });
    // Setup the Google OAuth routes
    app.get('/auth/google', passport_1.default.authenticate('google', { scope: ['profile', 'email'] }));
    app.get('/auth/google/callback', passport_1.default.authenticate('google', { failureRedirect: '/login' }), function (req, res) {
        // Successful authentication, redirect to your Next.js app with the user info as a query param
        // res.redirect(`http://your-nextjs-app.com?user=${JSON.stringify(req.user)}`);
        //   res.redirect(`http://localhost:3000/test`);
        // Set a session cookie
        req.session.user = req.user;
        res.redirect('http://localhost:3000/test');
    });
    app.get('/isLoggedIn', (req, res) => {
        if (req.session.user) {
            res.send({ loggedIn: true, user: req.session.user });
        }
        else {
            res.send({ loggedIn: false });
        }
    });
    app.post('/logout', (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                res.status(500).send({ loggedOut: false });
            }
            else {
                res.clearCookie('connect.sid'); // If you're using the default session cookie name
                res.send({ loggedOut: true });
            }
        });
    });
}
exports.addAuthRoutes = addAuthRoutes;
function makeGoogleStrategy() {
    return new passport_google_oauth20_1.Strategy({
        clientID: process.env.GOOGLE_ID,
        clientSecret: process.env.GOOGLE_SECRET,
        callbackURL: 'http://localhost:3001/auth/google/callback',
    }, async function (accessToken, refreshToken, profile, done) {
        if (!profile.emails) {
            return done('No email');
        }
        const email = profile.emails[0].value;
        const client = await (0, db_1.getDbClient)();
        const createTokenRecord = async (userId) => {
            const tokenRes = await client.query(`INSERT INTO oauth_tokens (user_id, provider, provider_user_id, access_token, id_token, refresh_token, token_expiry) 
            VALUES ($1, $2, $3, $4, $5, $6, TO_TIMESTAMP($7)) RETURNING id`, [
                userId,
                profile.provider,
                profile.id,
                accessToken,
                null,
                refreshToken,
                profile._json.exp, // Expiry time
            ]);
            return tokenRes.rows[0].id;
        };
        try {
            await client.query('BEGIN');
            let userId = await (0, db_1.getUserByEmail)(client, email);
            let tokenId = null;
            if (userId) {
                await client.query('DELETE FROM oauth_tokens WHERE user_id = $1', [
                    userId,
                ]);
                tokenId = await createTokenRecord(userId);
            }
            else {
                const tenantRes = await client.query(`INSERT INTO tenants (name) VALUES ($1) RETURNING id`, ['Your Organization']);
                const tenantId = tenantRes.rows[0].id;
                const userRes = await client.query(`INSERT INTO users (name, email, selected_tenant_id) VALUES ($1, $2, $3) RETURNING id`, [profile.name, profile.emails[0], tenantId]);
                const userId = userRes.rows[0].id;
                await client.query(`INSERT INTO user_tenants (user_id, tenant_id) VALUES ($1, $2)`, [userId, tenantId]);
                tokenId = await createTokenRecord(userId);
            }
            await client.query('COMMIT');
            done(null, {
                id: tokenId,
                name: profile.displayName,
                email,
            });
        }
        catch (e) {
            await client.query('ROLLBACK');
            done(e);
        }
        finally {
            client.release();
        }
    });
}
exports.makeGoogleStrategy = makeGoogleStrategy;
//# sourceMappingURL=auth.js.map