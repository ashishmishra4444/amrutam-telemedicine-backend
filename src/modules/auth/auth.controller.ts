import type { Request, Response, NextFunction } from "express";
import { loginSchema, registerSchema } from "./auth.schema";
import { loginUser, registerUser } from "./auth.service";

export async function registerController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const input = registerSchema.parse(req.body);
    const user = await registerUser(input);

    res.status(201).json({
      message: "Account created successfully.",
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

export async function loginController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const input = loginSchema.parse(req.body);
    const user = await loginUser(input);

    res.status(200).json({
      message: "Login successful.",
      data: user,
    });
  } catch (error) {
    next(error);
  }
}
