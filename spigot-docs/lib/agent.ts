import { addTransaction, addUsageLog, type UsageLog } from './store';

export type AgentState = 'idle' | 'running' | 'error';

export interface AgentTool {
  name: string;
  description: string;
  cost: number;
}

export interface AgentStep {
  tool: string;
  input: Record<string, unknown>;
  output: string;
  durationMs: number;
  cost: number;
}

export interface AgentResult {
  result: string;
  steps: AgentStep[];
  cost: number;
  durationMs: number;
}

export interface AgentStatus {
  initialized: boolean;
  state: AgentState;
  credits: number;
  totalCalls: number;
  totalCost: number;
  tools: AgentTool[];
}

export interface ChatResponse {
  text: string;
  toolsUsed: string[];
  cost: number;
  durationMs: number;
}

const AVAILABLE_TOOLS: AgentTool[] = [
  { name: 'search', description: 'Search the web for information', cost: 0.01 },
  { name: 'calculator', description: 'Perform mathematical calculations', cost: 0.005 },
  { name: 'weather', description: 'Get current weather data', cost: 0.02 },
  { name: 'database', description: 'Query the database', cost: 0.03 },
  { name: 'email', description: 'Send an email', cost: 0.05 },
];

// Singleton agent instance
declare global {
  // eslint-disable-next-line no-var
  var __spigotAgent: SpigotAgent | undefined;
}

export class SpigotAgent {
  private state: AgentState = 'idle';
  private credits = 10.0;
  private totalCalls = 0;
  private totalCost = 0;
  private initialized = true;

  getState(): AgentState {
    return this.state;
  }

  getCredits(): number {
    return this.credits;
  }

  getTotalCalls(): number {
    return this.totalCalls;
  }

  getTotalCost(): number {
    return this.totalCost;
  }

  getTools(): AgentTool[] {
    return AVAILABLE_TOOLS;
  }

  getStatus(): AgentStatus {
    return {
      initialized: this.initialized,
      state: this.state,
      credits: Math.round(this.credits * 10000) / 10000,
      totalCalls: this.totalCalls,
      totalCost: Math.round(this.totalCost * 10000) / 10000,
      tools: AVAILABLE_TOOLS,
    };
  }

  fund(amount: number, receipt: string): {
    success: boolean;
    added: number;
    balance: number;
    paymentId: string;
  } {
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    this.credits += amount;

    addTransaction({
      id: paymentId,
      amount,
      currency: 'USD',
      receipt,
      endpoint: '/api/agent/fund',
      timestamp: new Date().toISOString(),
      status: 'completed',
    });

    return {
      success: true,
      added: amount,
      balance: Math.round(this.credits * 10000) / 10000,
      paymentId,
    };
  }

  async chat(message: string): Promise<ChatResponse> {
    const startTime = Date.now();
    this.state = 'running';
    this.totalCalls++;

    const toolsUsed: string[] = [];
    let cost = 0;

    // Simulate tool selection based on message content
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('search') || lowerMessage.includes('find') || lowerMessage.includes('look')) {
      toolsUsed.push('search');
      cost += AVAILABLE_TOOLS[0].cost;
    }
    if (lowerMessage.includes('calc') || lowerMessage.includes('math') || lowerMessage.includes('compute')) {
      toolsUsed.push('calculator');
      cost += AVAILABLE_TOOLS[1].cost;
    }
    if (lowerMessage.includes('weather') || lowerMessage.includes('temperature')) {
      toolsUsed.push('weather');
      cost += AVAILABLE_TOOLS[2].cost;
    }
    if (lowerMessage.includes('data') || lowerMessage.includes('query') || lowerMessage.includes('database')) {
      toolsUsed.push('database');
      cost += AVAILABLE_TOOLS[3].cost;
    }
    if (lowerMessage.includes('email') || lowerMessage.includes('send') || lowerMessage.includes('mail')) {
      toolsUsed.push('email');
      cost += AVAILABLE_TOOLS[4].cost;
    }

    // Default to search if no tools matched
    if (toolsUsed.length === 0) {
      toolsUsed.push('search');
      cost += AVAILABLE_TOOLS[0].cost;
    }

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 400));

    const durationMs = Date.now() - startTime;
    this.totalCost += cost;
    this.credits = Math.max(0, this.credits - cost);
    this.state = 'idle';

    const text = this.generateResponse(message, toolsUsed);

    const log: UsageLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      endpoint: '/api/agent/chat',
      method: 'POST',
      timestamp: new Date().toISOString(),
      durationMs,
      cost,
    };
    addUsageLog(log);

    return {
      text,
      toolsUsed,
      cost: Math.round(cost * 10000) / 10000,
      durationMs,
    };
  }

  async run(task: string): Promise<AgentResult> {
    const startTime = Date.now();
    this.state = 'running';
    this.totalCalls++;

    const steps: AgentStep[] = [];
    let totalCost = 0;

    // Step 1: Analyze the task
    const analyzeStart = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));
    const analyzeCost = 0.01;
    totalCost += analyzeCost;
    steps.push({
      tool: 'analyze',
      input: { task },
      output: `Analyzed task: ${task.slice(0, 100)}`,
      durationMs: Date.now() - analyzeStart,
      cost: analyzeCost,
    });

    // Step 2: Search for relevant information
    const searchStart = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));
    const searchCost = 0.01;
    totalCost += searchCost;
    steps.push({
      tool: 'search',
      input: { query: task },
      output: `Found 3 relevant results for: ${task.slice(0, 80)}`,
      durationMs: Date.now() - searchStart,
      cost: searchCost,
    });

    // Step 3: Process and compile results
    const processStart = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 80 + Math.random() * 150));
    const processCost = 0.015;
    totalCost += processCost;
    steps.push({
      tool: 'process',
      input: { data: 'search_results' },
      output: 'Compiled and structured results',
      durationMs: Date.now() - processStart,
      cost: processCost,
    });

    const durationMs = Date.now() - startTime;
    this.totalCost += totalCost;
    this.credits = Math.max(0, this.credits - totalCost);
    this.state = 'idle';

    const log: UsageLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      endpoint: '/api/agent/run',
      method: 'POST',
      timestamp: new Date().toISOString(),
      durationMs,
      cost: totalCost,
    };
    addUsageLog(log);

    return {
      result: `Task completed: ${task}\n\nThe agent analyzed the task, searched for relevant information, and compiled the results. All steps completed successfully.`,
      steps,
      cost: Math.round(totalCost * 10000) / 10000,
      durationMs,
    };
  }

  private generateResponse(message: string, toolsUsed: string[]): string {
    const toolList = toolsUsed.join(', ');
    return `I've processed your message using the following tools: ${toolList}.\n\nYou asked about: "${message.slice(0, 100)}${message.length > 100 ? '...' : ''}"\n\nBased on the available data, here's what I found. The analysis is complete and all relevant information has been gathered.`;
  }
}

export function getAgent(): SpigotAgent {
  if (!globalThis.__spigotAgent) {
    globalThis.__spigotAgent = new SpigotAgent();
  }
  return globalThis.__spigotAgent;
}
