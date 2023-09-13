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
