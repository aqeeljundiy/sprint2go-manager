// Who is signed in to the team app v2, in which company, and small reads shared by its pages.
import { createContext, useContext } from 'react';
import type { Todo, User, Workspace } from '../types';
import { todayKey } from './ui';

export interface Team {
  me: User;
  ws: Workspace;
  users: User[];
  members: User[];
}
export const TeamCtx = createContext<Team | null>(null);
export const useTeam = () => useContext(TeamCtx)!;

export const inWs = (ws: Workspace) => (x: { workspaceId?: string }) => !x.workspaceId || x.workspaceId === ws.id;
export const doers = (tk: Todo) => (tk.assignees?.length ? tk.assignees : tk.userId ? [tk.userId] : []);
export const isMine = (me: User) => (tk: Todo) => doers(tk).includes(me.id);
/** Open tasks of mine due today or earlier: the work of today. */
export const dueNow = (tk: Todo) => !tk.done && !!tk.due && tk.due <= todayKey();
export const nameOf = (users: User[], id?: string) => users.find((u) => u.id === id)?.name ?? '';
