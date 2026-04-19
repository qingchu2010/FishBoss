import { z } from 'zod';

export const usernameSchema = z.string()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens');

export const displayNameSchema = z.string()
  .min(1, 'Display name is required')
  .max(64, 'Display name must be at most 64 characters');

export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const bootstrapRequestSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
  confirmPassword: passwordSchema,
  bootstrapToken: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const loginRequestSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmPassword: passwordSchema,
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const statusResponseSchema = z.object({
  setupRequired: z.boolean(),
  authenticated: z.boolean(),
  user: z.object({
    id: z.string(),
    username: z.string(),
    displayName: z.string(),
  }).nullable(),
});

export const userResponseSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
});

export const bootstrapResponseSchema = z.object({
  user: userResponseSchema,
});

export const loginResponseSchema = z.object({
  user: userResponseSchema,
});

export const logoutResponseSchema = z.object({
  success: z.boolean(),
});

export const changePasswordResponseSchema = z.object({
  success: z.boolean(),
});

export const meResponseSchema = z.object({
  user: userResponseSchema,
});

export type BootstrapRequest = z.infer<typeof bootstrapRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type StatusResponse = z.infer<typeof statusResponseSchema>;
export type UserResponse = z.infer<typeof userResponseSchema>;
export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;
export type ChangePasswordResponse = z.infer<typeof changePasswordResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
