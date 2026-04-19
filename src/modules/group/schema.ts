import { z } from 'zod';

export const GROUP_RESERVATION_STATUS = {
  NOT_IMPLEMENTED: 'not_implemented',
  PLANNED: 'planned',
  IN_DEVELOPMENT: 'in_development',
  PARTIALLY_IMPLEMENTED: 'partially_implemented',
} as const;

export type GroupReservationStatus = typeof GROUP_RESERVATION_STATUS[keyof typeof GROUP_RESERVATION_STATUS];

export interface GroupReservationInfo {
  status: GroupReservationStatus;
  message: string;
  estimatedVersion?: string;
  featureDescription: string;
}

export const groupReservationInfo: GroupReservationInfo = {
  status: GROUP_RESERVATION_STATUS.NOT_IMPLEMENTED,
  message: 'This feature is reserved for future implementation. The API surface is preserved for frontend development.',
  featureDescription: 'Group management for organizing users and resources.',
};

export const GroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  members: z.array(z.string()).default([]),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Group = z.infer<typeof GroupSchema>;

export interface GroupResponse extends GroupReservationInfo {
  data: null;
}

export function createGroupNotImplementedResponse(feature: string): GroupResponse {
  return {
    ...groupReservationInfo,
    featureDescription: feature,
    data: null,
  };
}
