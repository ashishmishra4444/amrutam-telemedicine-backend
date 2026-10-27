import { Router } from "express";
import { loginController, registerController } from "./auth.controller";
import { authRateLimit } from "../../common/middleware/rate-limit";

const authRouter = Router();

authRouter.post("/register", authRateLimit, registerController);
authRouter.post("/login", authRateLimit, loginController);

export default authRouter;
