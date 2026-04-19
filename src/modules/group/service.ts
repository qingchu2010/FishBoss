import type { GroupResponse } from './schema.js';
import { createGroupNotImplementedResponse, groupReservationInfo } from './schema.js';

export class GroupService {
  list(): Promise<GroupResponse> {
    return Promise.resolve(createGroupNotImplementedResponse('Group list'));
  }

  get(id: string): Promise<GroupResponse> {
    return Promise.resolve(createGroupNotImplementedResponse(`Group get: ${id}`));
  }

  create(_data: unknown): Promise<GroupResponse> {
    return Promise.resolve(createGroupNotImplementedResponse('Group create'));
  }

  update(id: string, _data: unknown): Promise<GroupResponse> {
    return Promise.resolve(createGroupNotImplementedResponse(`Group update: ${id}`));
  }

  delete(id: string): Promise<GroupResponse> {
    return Promise.resolve(createGroupNotImplementedResponse(`Group delete: ${id}`));
  }

  addMember(groupId: string, userId: string): Promise<GroupResponse> {
    return Promise.resolve(createGroupNotImplementedResponse(`Group addMember: ${groupId}, ${userId}`));
  }

  removeMember(groupId: string, userId: string): Promise<GroupResponse> {
    return Promise.resolve(createGroupNotImplementedResponse(`Group removeMember: ${groupId}, ${userId}`));
  }

  getStatus(): Promise<GroupResponse> {
    return Promise.resolve({
      ...groupReservationInfo,
      featureDescription: 'Group management API - Reserved module',
      data: null,
    });
  }
}
