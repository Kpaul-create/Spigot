/**
 * LangGraph agent that can actually pay for what it calls.
 *
 * The previous `lib/agent.ts` picked tools by keyword match, spent a
 * `setTimeout` to look busy, and returned canned strings — it never invoked a
 * model or a tool. This replaces it with a real graph:
 *
 *   decide -> pay -> call -> reflect -> (loop | done)
 *
 * `pay` is the node that matters: it settles a real TIP-20 transfer on Tempo
 * and hands the verified receipt to the endpoint. A payment failure is a real
 * error that stops the run, not a line in a log.
 *
 * Memory is real too, via a LangGraph checkpointer keyed by thread, so a
 * conversation's state (including its spend) survives across requests rather
 * than living in a singleton object that a restart wipes.
 */
import { StateGraph, START, END, Annotation, MemorySaver } from '@langchain/langgraph';
import { z } from 'zod';
import { getChatModel, getModelStatus } from './llm';
import { priceOf } from './pricing';
import {
  settlePayment,
  verifyReceipt,
  getSettlementAddress,
  isBurnAddress,
  type SettlementResult,
} from './tempo/payment';
import { getTempoSigner, isTempoSignerConfigured, type TempoSigner } from './tempo/signer';
import { getTempoRpcUrl, resolveToken, TEMPO_MODERATO } from './tempo/chain';

/** A tool the agent may call, with a price in USD. */
export interface AgentTool {
  name: string;
  description: string;
  /** Price per call. Settled on Tempo before the call is made. */
  cost: number;
}

/**
 * Paid endpoints, and where settlement goes.
 *
 * `settleTo` is the merchant address, which must be configured explicitly.
 *
 * Descriptions state what the route actually returns. `premium_data` previously
 * advertised "advanced_analytics and priority_support" while the route returned
 * the literal string "This is exclusive premium content available only to paying
 * users" — the model was being asked to spend real money on a placeholder.
 */
const PAID_ENDPOINTS: Record<string, { path: string; cost: number; description: string }> = {
  premium_data: {
    path: '/api/premium-data',
    // From `lib/pricing`, which the paywall itself reads. These were separate
    // literals, which is how the agent and the route could disagree.
    cost: priceOf('/api/premium-data')!,
    description:
      'Live crypto market snapshot: BTC/ETH/SOL price with 24h change and market cap, total market cap, 24h volume, BTC and ETH dominance, active coin count',
  },
  weather: {
    path: '/api/weather',
    cost: priceOf('/api/weather')!,
    description:
      'Current observed weather for any city: temperature, apparent temperature, humidity, wind speed, condition and WMO code',
  },
};

export const AVAILABLE_TOOLS: AgentTool[] = Object.entries(PAID_ENDPOINTS).map(([name, e]) => ({
  name,
  description: e.description,
  cost: e.cost,
}));

/**
 * Who the model is told it is. Prepended to every prompt in this file.
 *
 * Without it the model falls back to its own persona. Asked "can you pay for
 * something?", Gemini replied "as a large language model, I am an AI and do not
 * have the ability to make payments or handle financial transactions" — while
 * holding a funded Tempo wallet and having just settled real transfers two
 * messages earlier. The model cannot see `settlePayment`, the wallet or the
 * chain, so the capability has to be stated in the prompt or it does not exist.
 *
 * The refusal was not only in `decide`. The closing answer used a bare "Answer
 * the user directly. No paid tool was needed.", which gave the model no reason
 * to believe it could pay for anything.
 */
const CAPABILITY = `You are the Spigot agent. You can call paid tools only when a supported Tempo signer and a valid merchant destination are configured. The payment handler enforces this before any transfer is sent.

When payment setup is ready, pay only for the listed tools immediately before calling them, and claim success only after the tool result confirms the call. When setup is not ready, explain the configuration blocker and do not claim that you can currently pay. If a request falls outside the listed tools, explain which supported tools are available instead.`;

/** The tool catalogue as the model sees it, with prices. */
function catalogue(): string {
  return AVAILABLE_TOOLS.map((t) => `- ${t.name} ($${t.cost}): ${t.description}`).join('\n');
}

/** Agent state, threaded across graph nodes. */
export const AgentState = Annotation.Root({
  messages: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  /** The user's task. */
  task: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => '',
  }),
  threadId: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => 'default',
  }),
  agentId: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => 'agt-0000',
  }),
  /** Tool the model chose this turn. */
  chosenTool: Annotation<string | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),
  /**
   * Arguments the model returned for `chosenTool`, forwarded to the endpoint.
   *
   * Without this the model could ask for weather in Oslo and still get London,
   * because the arguments never left `decide`.
   */
  toolArgs: Annotation<Record<string, string>>({
    reducer: (_a, b) => b,
    default: () => ({}),
  }),
  /** Cumulative spend in USD across the thread. */
  totalSpent: Annotation<number>({
    reducer: (a, b) => a + b,
    default: () => 0,
  }),
  /** Receipt from the most recent settlement. */
  receipt: Annotation<string | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),
  /** Result of the most recent paid call. */
  toolResult: Annotation<string | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),
  step: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),
  done: Annotation<boolean>({
    reducer: (_a, b) => b,
    default: () => false,
  }),
  error: Annotation<string | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),
});

/** Cap on graph iterations, so a confused model cannot loop forever. */
const MAX_STEPS = 4;

/** Schema handed to the model for each paid tool's arguments. */
const toolArgSchemas = {
  premium_data: z.object({}),
  weather: z.object({ city: z.string().optional() }),
} as const;

/**
 * Node 1: ask the model which paid tool to use, if any.
 *
 * Falls back to `none` if the model output cannot be parsed, so a malformed
 * reply degrades to "no tool" rather than throwing mid-run.
 */
async function decide(state: typeof AgentState.State) {
  const tools = catalogue();
  // `getChatModel` returns the BaseChatModel interface, whose `bindTools` is
  // optional; every concrete model this builds from (ChatOpenAI, and the
  // gateway's OpenAI-compatible surface) implements it.
  const base = getChatModel();
  if (!base.bindTools) {
    throw new Error('Configured chat model does not support tool calling');
  }
  const model = base.bindTools(
    AVAILABLE_TOOLS.map((t) => ({
      // The OpenAI envelope is mandatory, not cosmetic. `@langchain/openai`'s
      // `_convertToOpenAITool` only rewrites a tool that is a LangChain tool
      // instance; a bare `{ name, description, parameters }` object is neither
      // that nor an OpenAI tool, so it is passed straight through to the wire
      // *unwrapped*. OpenAI-compatible hosts then reject it —
      // `Unknown name "name" at 'tools[0]'` from Google's layer. Wrapping it so
      // `isOpenAITool()` matches is what puts `function` in the right place.
      type: 'function' as const,
      function: {
        name: t.name,
        description: `${t.description}. Costs $${t.cost} per call, paid on Tempo testnet.`,
        // LangChain's tool wrapper expects `parameters` (a JSON Schema). Passing a
        // bare Zod object under `schema` left the model with no argument contract
        // on the OpenAI-compatible gateway, which is how `city` came back missing.
        parameters: z.toJSONSchema(
          toolArgSchemas[t.name as keyof typeof toolArgSchemas] ?? z.object({}),
        ),
      },
    })),
    { tool_choice: 'auto' },
  );

  const response = await model.invoke([
    {
      role: 'system',
      content: `${CAPABILITY}

Pick a tool when the task needs live data you do not already have — current weather, current prices, market figures. Do not answer those from memory; call the tool and pay for it. Calling a tool is the normal path here, not a last resort. If a tool genuinely fits, call the cheapest one that does and call nothing else.

Available paid tools:
${tools}

If no tool fits, reply with a short plain-text answer and no tool call.`,
    },
    { role: 'user', content: state.task },
  ]);

  const toolCalls = (response as { tool_calls?: { name: string; args: Record<string, string> }[] })
    .tool_calls;

  if (!toolCalls?.length) {
    return { chosenTool: null, step: state.step + 1, done: true };
  }

  const args = toolCalls[0].args ?? {};

  return {
    chosenTool: toolCalls[0].name,
    toolArgs: Object.fromEntries(
      Object.entries(args).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]),
    ),
    step: state.step + 1,
  };
}

/**
 * Node 2: settle the payment for the chosen tool.
 *
 * This is the step that was entirely absent before. On failure it records the
 * error and ends the run; the paid call is never made.
 */
async function pay(state: typeof AgentState.State) {
  const toolName = state.chosenTool;
  if (!toolName) return {};

  const endpoint = PAID_ENDPOINTS[toolName];
  if (!endpoint) {
    return { error: `Unknown tool ${toolName}`, done: true };
  }

  if (!isTempoSignerConfigured()) {
    return {
      error:
        'No Tempo signer configured. Set TEMPO_PRIVATE_KEY in .env.local (or TEMPO_SIGNER=dynamic with Dynamic credentials) before the agent can pay.',
      done: true,
    };
  }

  const merchantAddress = getSettlementAddress();
  if (!merchantAddress || isBurnAddress(merchantAddress)) {
    return {
      error:
        'Merchant payout address is not ready. Set TEMPO_MERCHANT_ADDRESS to a valid wallet you control; payment is disabled until then.',
      done: true,
    };
  }

  try {
    const signer: TempoSigner = getTempoSigner();
    const settlement: SettlementResult = await settlePayment(
      {
        amount: endpoint.cost,
        // Merchant destination, resolved in one place so the agent settles to
        // the same address `verifyReceipt` insists on.
        to: merchantAddress,
        endpoint: endpoint.path,
        agentId: state.agentId,
      },
      signer,
    );

    return {
      receipt: settlement.receipt,
      totalSpent: endpoint.cost,
    };
  } catch (error) {
    return {
      error: `Payment for ${toolName} failed: ${error instanceof Error ? error.message : String(error)}`,
      done: true,
    };
  }
}

/** Node 3: make the paid call, attaching the on-chain receipt. */
async function call(state: typeof AgentState.State) {
  if (!state.chosenTool || !state.receipt) return { done: true };

  const endpoint = PAID_ENDPOINTS[state.chosenTool];

  // Pre-flight the receipt so a bad one fails here with a readable reason
  // instead of coming back as an opaque 402 body.
  //
  // `markRedeemed: false` matters: this check and the endpoint's own check run
  // in the same process against the same replay guard, so consuming the receipt
  // here made every paid call the agent made come back "already redeemed". The
  // endpoint is the thing that actually consumes it.
  const check = await verifyReceipt(state.receipt, {
    endpoint: endpoint.path,
    minAmount: endpoint.cost,
    agentId: state.agentId,
    markRedeemed: false,
  });

  if (!check.valid) {
    return { error: `Receipt rejected: ${check.reason}`, done: true };
  }

  const base = process.env.SPIGOT_SELF_URL || 'http://localhost:3000';

  // Tool arguments reach the endpoint as a query string. They used to be
  // dropped entirely, so `weather` always answered for London no matter what
  // city the task named.
  const args = state.toolArgs;
  const query = args && Object.keys(args).length > 0
    ? `?${new URLSearchParams(
        Object.entries(args).filter(([, v]) => v !== undefined && v !== null && v !== ''),
      ).toString()}`
    : '';

  try {
    const response = await fetch(`${base}${endpoint.path}${query}`, {
      headers: { 'Payment-Receipt': state.receipt, 'X-Agent-Id': state.agentId },
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      // `done` is a boolean channel. Assigning a status string here left `error`
      // null, so /api/agent/run answered HTTP 200 with an LLM-written summary of
      // a 402 payload and reported success.
      return {
        toolResult: JSON.stringify(body).slice(0, 2000),
        error: `Endpoint ${endpoint.path} returned ${response.status}`,
        done: true,
      };
    }

    return {
      toolResult: JSON.stringify(body).slice(0, 2000),
      step: state.step + 1,
      done: true,
    };
  } catch (error) {
    return {
      error: `Call failed: ${error instanceof Error ? error.message : String(error)}`,
      done: true,
    };
  }
}

/**
 * Node 4: close out the run.
 *
 * This used to return `{}` for any step below `MAX_STEPS`, which sent the
 * conditional edge back to `decide`. Since `decide` re-asks the model the same
 * question at temperature 0, it picked the same tool, `pay` broadcast a second
 * real transfer, and `totalSpent` finished at double the endpoint price. There
 * is no tool-chaining logic here to justify a second pass, so the run is
 * single-shot: decide once, pay once, call once, done.
 */
async function reflect(state: typeof AgentState.State) {
  return { done: true };
}

/** Builds the graph. Exposed separately so it can be inspected in tests. */
export function buildAgentGraph() {
  const graph = new StateGraph(AgentState)
    .addNode('decide', decide)
    .addNode('pay', pay)
    .addNode('call', call)
    .addNode('reflect', reflect)
    .addEdge(START, 'decide')
    .addConditionalEdges('decide', (s) => (s.chosenTool ? 'pay' : END), {
      pay: 'pay',
      [END]: END,
    })
    .addEdge('pay', 'call')
    .addEdge('call', 'reflect')
    .addConditionalEdges('reflect', (s) => (s.error || s.done || s.step >= MAX_STEPS ? END : 'decide'), {
      decide: 'decide',
      [END]: END,
    });

  return graph.compile({ checkpointer: new MemorySaver() });
}

// Compiled once per process: graph construction is not free, and the checkpointer
// inside is what carries memory between requests.
let compiled: ReturnType<typeof buildAgentGraph> | null = null;

export function getCompiledAgent() {
  if (!compiled) compiled = buildAgentGraph();
  return compiled;
}

export interface RunAgentOptions {
  task: string;
  threadId?: string;
  agentId?: string;
}

export interface RunAgentResult {
  threadId: string;
  agentId: string;
  answer: string;
  toolUsed: string | null;
  receipt: string | null;
  totalSpent: number;
  error: string | null;
  steps: number;
  /** Chain the settlement happened on, for display. */
  network: string;
}

/**
 * Runs the agent to completion for one task.
 *
 * Memory is keyed by `threadId`, so follow-up tasks in the same thread see the
 * prior messages and cumulative spend.
 */
export async function runAgent(options: RunAgentOptions): Promise<RunAgentResult> {
  const threadId = options.threadId || `thread-${Date.now()}`;
  const agentId = options.agentId || `agt-${threadId.slice(-4)}`;

  const model = getChatModel();
  const graph = getCompiledAgent();

  const result = await graph.invoke(
    { task: options.task, threadId, agentId },
    { configurable: { thread_id: threadId } },
  );

  // Synthesize the final user-facing answer from whatever the graph produced.
  let answer: string;
  if (result.error) {
    answer = result.error;
  } else if (result.toolResult) {
    const response = await model.invoke([
      {
        role: 'system',
        content: `${CAPABILITY}

You have paid for and called one tool. This is its real output, and the payment is already settled. Report what came back in two sentences. Do not tell the user you cannot access paid data or that you are unable to make payments.`,
      },
      { role: 'user', content: `Task: ${options.task}\n\nTool (${result.chosenTool}) returned:\n${result.toolResult}` },
    ]);
    answer = String((response as { content: string }).content);
  } else {
    const response = await model.invoke([
      {
        role: 'system',
        content: `${CAPABILITY}

No tool was needed for this one, so nothing was spent. Answer the question directly and briefly, in your own voice as the Spigot agent.

If the user asked what you can pay for, or asked you to pay for something, answer from the fact that you pay for your own tool calls yourself. If their request is not one of your tools, say so plainly and name the tools you can pay for, rather than declining on the grounds that you are an AI without payment abilities.

Tools you can pay for:
${catalogue()}`,
      },
      { role: 'user', content: options.task },
    ]);
    answer = String((response as { content: string }).content);
  }

  return {
    threadId,
    agentId,
    answer,
    toolUsed: result.chosenTool ?? null,
    receipt: result.receipt ?? null,
    totalSpent: result.totalSpent,
    error: result.error ?? null,
    steps: result.step,
    network: `Tempo Moderato (chainId ${TEMPO_MODERATO.chainId}, ${getTempoRpcUrl()})`,
  };
}

/** Wallet, model, and chain status for the agent UI. */
export function getAgentStatus() {
  let wallet: { configured: boolean; address?: string; error?: string } = {
    configured: isTempoSignerConfigured(),
  };

  if (wallet.configured) {
    try {
      wallet = { configured: true, address: getTempoSigner().address };
    } catch (error) {
      wallet = { configured: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    wallet,
    tools: AVAILABLE_TOOLS,
    model: getModelStatus(),
    defaultToken: resolveToken().symbol,
    network: { chainId: TEMPO_MODERATO.chainId, name: TEMPO_MODERATO.name, rpcUrl: getTempoRpcUrl() },
  };
}
