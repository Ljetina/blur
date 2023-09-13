import session from 'express-session';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  profilePic?: string;
}

declare module 'express-session' {
  export interface SessionData {
    user?: SessionUser;
  }
}
export {};

declare global {
  namespace Express {
    interface Request {
      user_id?: string;
      tenant_id?: string;
    }
  }
}