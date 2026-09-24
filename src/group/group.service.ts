import { Injectable } from '@nestjs/common';
import type { API } from 'zca-js';
import { ZaloSession, ZaloSessionService } from './zalo-session.service';

export type GroupMember = {
  id: string;
  name: string;
  avatar: string;
  role: 'owner' | 'admin' | 'member';
};

export type GroupLinkMembersResult = {
  name: string;
  total: number;
  members: GroupMember[];
  /** Nhóm khóa xem danh sách thành viên với người ngoài. */
  locked: boolean;
  /** Lần gọi này đã tham gia nhóm. */
  joined: boolean;
  joinError?: string;
};

type RosterRecord = {
  creatorId?: string;
  adminIds?: string[];
  memberIds?: string[];
  memVerList?: string[];
};

const ROLE_RANK = { owner: 0, admin: 1, member: 2 } as const;
const sortByRole = (list: GroupMember[]) =>
  [...list].sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class GroupService {
  constructor(private readonly sessions: ZaloSessionService) {}

  /** Endpoint `getmg` cũ trả đủ memberIds (getmg-v2 thì không). */
  private async fetchRoster(
    api: API,
    groupId: string,
  ): Promise<RosterRecord | undefined> {
    if (!('getGroupRoster' in api)) {
      api.custom('getGroupRoster', async ({ ctx, utils, props }) => {
        const { groupId: gid, base } = props as {
          groupId: string;
          base: string;
        };
        const url = utils.makeURL(`${base}/api/group/getmg`);
        const params = utils.encodeAES(
          JSON.stringify({
            grids: [gid],
            avatar_size: 120,
            member_avatar_size: 120,
            imei: ctx.imei,
          }),
        );
        if (!params) throw new Error('Không mã hóa được yêu cầu');
        const res = await utils.request(url, {
          method: 'POST',
          body: new URLSearchParams({ params }),
        });
        return utils.resolve(res);
      });
    }
    const ra = api as unknown as {
      getGroupRoster: (p: {
        groupId: string;
        base: string;
      }) => Promise<unknown>;
      zpwServiceMap: { group: string[] };
    };
    const data = (await ra.getGroupRoster({
      groupId,
      base: ra.zpwServiceMap.group[0],
    })) as { gridInfoMap?: Record<string, RosterRecord> } & Record<
      string,
      unknown
    >;
    return (
      data?.gridInfoMap?.[groupId] ??
      (data?.[groupId] as RosterRecord | undefined)
    );
  }

  private async rosterMembers(
    api: API,
    selfId: string,
    rec: RosterRecord,
  ): Promise<GroupMember[]> {
    const admins = new Set<string>(rec.adminIds ?? []);
    const raw = rec.memberIds?.length ? rec.memberIds : (rec.memVerList ?? []);
    const ids = [
      ...new Set(raw.map((v) => v.split('_')[0]).filter(Boolean)),
    ].filter((id) => id !== selfId);
    const members: GroupMember[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const res = await api.getGroupMembersInfo(ids.slice(i, i + 100));
      for (const prof of Object.values(res.profiles ?? {})) {
        const id = String(prof.id);
        members.push({
          id,
          name: prof.displayName || prof.zaloName || id,
          avatar: prof.avatar ?? '',
          role:
            id === rec.creatorId
              ? 'owner'
              : admins.has(id)
                ? 'admin'
                : 'member',
        });
      }
    }
    return sortByRole(members);
  }

  async linkMembers(
    session: ZaloSession,
    link: string,
    join: boolean,
  ): Promise<GroupLinkMembersResult> {
    const api = await this.sessions.getApi(session);
    const info = await api.getGroupLinkInfo({ link });
    const name = info.name || link;
    const total = Number(info.totalMember) || 0;
    const locked = Number(info.setting?.lockViewMember) === 1;
    const groupId = info.groupId;

    // 1) Đã là thành viên → đọc đủ danh sách, không cần tham gia.
    let rec = await this.fetchRoster(api, groupId).catch(() => undefined);
    let joined = false;
    let joinError: string | undefined;

    // 2) Chưa là thành viên: tham gia khi được yêu cầu rõ ràng, rồi đọc lại.
    if (!rec?.memberIds?.length && join) {
      try {
        await api.joinGroupLink(link);
        joined = true;
        await sleep(1500);
        rec = await this.fetchRoster(api, groupId).catch(() => undefined);
      } catch (e) {
        joinError = e instanceof Error ? e.message : String(e);
      }
    }

    if (rec?.memberIds?.length) {
      const members = await this.rosterMembers(api, session.zaloId, rec);
      return { name, total, members, locked: false, joined, joinError };
    }

    // 3) Dự phòng: vài thành viên mẫu mà link công khai (phân trang).
    const byId = new Map<string, GroupMember>();
    const admins = new Set<string>(info.adminIds ?? []);
    for (let page = 1; page <= 30; page++) {
      const p =
        page === 1
          ? info
          : await api.getGroupLinkInfo({ link, memberPage: page });
      for (const m of p.currentMems ?? []) {
        byId.set(m.id, {
          id: m.id,
          name: m.dName || m.zaloName || m.id,
          avatar: m.avatar ?? '',
          role:
            m.id === info.creatorId
              ? 'owner'
              : admins.has(m.id)
                ? 'admin'
                : 'member',
        });
      }
    }
    return {
      name,
      total,
      locked: locked && byId.size === 0,
      members: sortByRole([...byId.values()]),
      joined,
      joinError,
    };
  }
}
