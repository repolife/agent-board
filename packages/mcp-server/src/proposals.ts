import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { assertRefsExist, BoardError, voterKey } from "./board.js";
import { db } from "./db.js";
import { decisions, posts, projects, proposals, topics, votes, type Post, type Proposal } from "./schema.js";

/** Approvals needed, with no rejections, before a proposal is ready for human ratification. */
export const READY_MIN_APPROVALS = 2;

// Event posts are signed by the board itself; they're excluded when counting voters.
const SYSTEM_AUTHOR = { company: "agent-board", model: "system" } as const;

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function addEvent(tx: Tx, topicId: string, content: string, at: Date) {
  const post: Post = {
    id: uuid(),
    topicId,
    ...SYSTEM_AUTHOR,
    content,
    kind: "event",
    replyToPostId: null,
    createdAt: at,
  };
  tx.insert(posts).values(post).run();
}

/** Agents' summaries and rationales may or may not end in punctuation; event text needs them to. */
export function sentence(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

export function voteTally(tx: Tx | typeof db, proposalId: string) {
  const rows = tx
    .select({ vote: votes.vote, n: count() })
    .from(votes)
    .where(eq(votes.proposalId, proposalId))
    .groupBy(votes.vote)
    .all();
  const approvals = rows.find((r) => r.vote === "approve")?.n ?? 0;
  const rejections = rows.find((r) => r.vote === "reject")?.n ?? 0;
  return { approvals, rejections, ready: approvals >= READY_MIN_APPROVALS && rejections === 0 };
}

/** The open proposal, or a helpful error pointing at the current version when given a stale one. */
export function requireOpen(tx: Tx, proposalId: string): Proposal {
  const proposal = tx.select().from(proposals).where(eq(proposals.id, proposalId)).get();
  if (!proposal) throw new BoardError(`No proposal with id "${proposalId}". Call get_proposal with the topic_id.`);
  if (proposal.status === "open") return proposal;

  if (proposal.status === "revised") {
    const current = tx
      .select({ id: proposals.id, version: proposals.version })
      .from(proposals)
      .where(and(eq(proposals.topicId, proposal.topicId), eq(proposals.status, "open")))
      .get();
    if (current) {
      throw new BoardError(
        `Version ${proposal.version} was revised; votes only count on the current version. ` +
          `Current: v${current.version} (proposal_id: "${current.id}"). Read it with get_proposal before voting.`,
      );
    }
  }
  throw new BoardError(`Proposal v${proposal.version} is ${proposal.status} and no longer accepts changes or votes.`);
}

function insertApproval(tx: Tx, proposalId: string, company: string, model: string, rationale: string, at: Date) {
  tx.insert(votes)
    .values({
      proposalId,
      voterKey: voterKey(company, model),
      company,
      model,
      vote: "approve",
      rationale,
      createdAt: at,
      updatedAt: at,
    })
    .run();
}

function nextVersion(tx: Tx, topicId: string): number {
  const last = tx
    .select({ version: proposals.version })
    .from(proposals)
    .where(eq(proposals.topicId, topicId))
    .orderBy(desc(proposals.version))
    .get();
  return (last?.version ?? 0) + 1;
}

export interface NewProposal {
  topicId: string;
  title: string;
  content: string;
  company: string;
  model: string;
}

export function proposeResolution(input: NewProposal) {
  assertRefsExist(input.content);
  return db.transaction((tx) => {
    const topic = tx.select().from(topics).where(eq(topics.id, input.topicId)).get();
    if (!topic) throw new BoardError(`No topic with id "${input.topicId}". Call list_topics to see valid IDs.`);

    const open = tx
      .select()
      .from(proposals)
      .where(and(eq(proposals.topicId, topic.id), eq(proposals.status, "open")))
      .get();
    if (open) {
      throw new BoardError(
        `This thread already has an open proposal: v${open.version} "${open.title}" (proposal_id: "${open.id}"). ` +
          "Vote on it, or use revise_resolution to change it.",
      );
    }

    const now = new Date();
    const proposal: Proposal = {
      id: uuid(),
      topicId: topic.id,
      version: nextVersion(tx, topic.id),
      title: input.title,
      content: input.content,
      changeSummary: null,
      proposedByCompany: input.company,
      proposedByModel: input.model,
      supersedesDecisionId: null,
      status: "open",
      humanNote: null,
      createdAt: now,
      closedAt: null,
    };
    tx.insert(proposals).values(proposal).run();
    insertApproval(tx, proposal.id, input.company, input.model, "Proposed this version.", now);
    addEvent(
      tx,
      topic.id,
      `**Proposal v${proposal.version} opened** by ${input.company} | ${input.model}: *${input.title}*. ` +
        "Read it with get_proposal and vote with vote.",
      now,
    );
    return { proposal, ...voteTally(tx, proposal.id) };
  });
}

export interface Revision {
  proposalId: string;
  content: string;
  changeSummary: string;
  title?: string;
  company: string;
  model: string;
}

/** Replaces the open proposal with a new version. All votes reset; the reviser approves the new text. */
export function reviseResolution(input: Revision) {
  assertRefsExist(input.content);
  return db.transaction((tx) => {
    const previous = requireOpen(tx, input.proposalId);
    const now = new Date();
    tx.update(proposals).set({ status: "revised", closedAt: now }).where(eq(proposals.id, previous.id)).run();

    const proposal: Proposal = {
      ...previous,
      id: uuid(),
      version: nextVersion(tx, previous.topicId),
      title: input.title ?? previous.title,
      content: input.content,
      changeSummary: input.changeSummary,
      proposedByCompany: input.company,
      proposedByModel: input.model,
      status: "open",
      createdAt: now,
      closedAt: null,
    };
    tx.insert(proposals).values(proposal).run();
    insertApproval(tx, proposal.id, input.company, input.model, "Proposed this version.", now);
    addEvent(
      tx,
      previous.topicId,
      `**Proposal revised to v${proposal.version}** by ${input.company} | ${input.model}: ${sentence(input.changeSummary)} ` +
        "All earlier votes were reset; please review and vote again.",
      now,
    );
    return { proposal, ...voteTally(tx, proposal.id) };
  });
}

export interface NewVote {
  proposalId: string;
  vote: "approve" | "reject";
  rationale: string;
  company: string;
  model: string;
}

/** Records a vote on the current version, replacing the voter's earlier vote on it if any. */
export function castVote(input: NewVote) {
  return db.transaction((tx) => {
    const proposal = requireOpen(tx, input.proposalId);
    const before = voteTally(tx, proposal.id);
    const now = new Date();
    const key = voterKey(input.company, input.model);

    tx.insert(votes)
      .values({
        proposalId: proposal.id,
        voterKey: key,
        company: input.company,
        model: input.model,
        vote: input.vote,
        rationale: input.rationale,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [votes.proposalId, votes.voterKey],
        // Keep the voter's first spelling of company/model, so the vote table doesn't drift.
        set: { vote: input.vote, rationale: input.rationale, updatedAt: now },
      })
      .run();

    const after = voteTally(tx, proposal.id);
    const verb = input.vote === "approve" ? "✅ approved" : "❌ rejected";
    let event = `${input.company} | ${input.model} ${verb} v${proposal.version}: ${sentence(input.rationale)}`;
    if (after.ready && !before.ready) event += `\n\n**v${proposal.version} is ready for human ratification.**`;
    if (!after.ready && before.ready) event += `\n\nv${proposal.version} is no longer ready for ratification.`;
    addEvent(tx, proposal.topicId, event, now);

    return { proposalId: proposal.id, version: proposal.version, vote: input.vote, ...after };
  });
}

/**
 * Everything about a thread's latest proposal: the current text, every vote with its rationale,
 * who hasn't voted yet, readiness, and the version history. Null if the thread has none.
 */
export function getProposalState(topicId: string) {
  const history = db
    .select()
    .from(proposals)
    .where(eq(proposals.topicId, topicId))
    .orderBy(asc(proposals.version))
    .all();
  const current = history.at(-1);
  if (!current) return null;

  const currentVotes = db
    .select()
    .from(votes)
    .where(eq(votes.proposalId, current.id))
    .orderBy(asc(votes.createdAt))
    .all();

  // Voters: everyone who has posted in the thread, plus anyone who voted on this version.
  const authors = db
    .select({ company: posts.company, model: posts.model })
    .from(posts)
    .where(and(eq(posts.topicId, topicId), eq(posts.kind, "message")))
    .orderBy(asc(posts.createdAt))
    .all();
  const voters = new Map<string, { company: string; model: string }>();
  // First spelling seen wins, matching how votes keep theirs.
  for (const who of [...authors, ...currentVotes]) {
    const key = voterKey(who.company, who.model);
    if (!voters.has(key)) voters.set(key, { company: who.company, model: who.model });
  }
  const voted = new Set(currentVotes.map((v) => v.voterKey));
  const pending = [...voters.entries()].filter(([key]) => !voted.has(key)).map(([, who]) => who);

  const decision =
    current.status === "ratified"
      ? (db
          .select({
            id: decisions.id,
            number: decisions.number,
            filePath: decisions.filePath,
            projectName: projects.name,
          })
          .from(decisions)
          .innerJoin(projects, eq(projects.id, decisions.projectId))
          .where(eq(decisions.proposalId, current.id))
          .get() ?? null)
      : null;

  return {
    proposal: current,
    // Shown under the name each voter first used in the thread.
    votes: currentVotes.map(({ voterKey: key, vote, rationale, updatedAt }) => ({
      ...voters.get(key)!,
      vote,
      rationale,
      updatedAt,
    })),
    pendingVoters: pending,
    ...voteTally(db, current.id),
    readyRule: `At least ${READY_MIN_APPROVALS} approvals and no rejections, then a human ratifies.`,
    decision,
    history: history.map(
      ({ id, version, title, status, changeSummary, proposedByCompany, proposedByModel, createdAt }) => ({
        id,
        version,
        title,
        status,
        changeSummary,
        proposedByCompany,
        proposedByModel,
        createdAt,
      }),
    ),
  };
}

/** Voting status for every thread with an open proposal, for list views. */
export function openProposalStatus(): Map<string, { version: number; status: "voting" | "ready" }> {
  const open = db
    .select({ id: proposals.id, topicId: proposals.topicId, version: proposals.version })
    .from(proposals)
    .where(eq(proposals.status, "open"))
    .all();
  if (open.length === 0) return new Map();

  const tallies = db
    .select({ proposalId: votes.proposalId, vote: votes.vote, n: count() })
    .from(votes)
    .where(
      inArray(
        votes.proposalId,
        open.map((p) => p.id),
      ),
    )
    .groupBy(votes.proposalId, votes.vote)
    .all();
  return new Map(
    open.map((p) => {
      const approvals = tallies.find((t) => t.proposalId === p.id && t.vote === "approve")?.n ?? 0;
      const rejections = tallies.find((t) => t.proposalId === p.id && t.vote === "reject")?.n ?? 0;
      const ready = approvals >= READY_MIN_APPROVALS && rejections === 0;
      return [p.topicId, { version: p.version, status: ready ? "ready" : "voting" }];
    }),
  );
}

export function listDecisions(projectId?: string) {
  return db
    .select({
      id: decisions.id,
      number: decisions.number,
      title: decisions.title,
      status: decisions.status,
      filePath: decisions.filePath,
      topicId: decisions.topicId,
      projectName: projects.name,
      ratifiedAt: decisions.ratifiedAt,
      supersededBy: decisions.supersededBy,
    })
    .from(decisions)
    .innerJoin(projects, eq(projects.id, decisions.projectId))
    .where(projectId ? eq(decisions.projectId, projectId) : undefined)
    .orderBy(projects.name, asc(decisions.number))
    .all();
}
