import { AccessContext } from "../authorization/authorization.types";

declare global {
  namespace Express {
    interface Request {
      auth?: AccessContext;
    }
  }
}

export {};
