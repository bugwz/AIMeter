import { Credential, UsageSnapshot, ProgressItem, UsageProvider, ProviderCostSnapshot } from '../../../src/types/index.js';
import { MockProviderConfig } from '../config.js';
import { getDefaultPeriodDates } from '../database.js';
import { roundPercentage } from '../../utils/usageTransformer.js';

type MockProviderCtorOptions = {
  provider: UsageProvider;
  config: MockProviderConfig;
  instanceId?: string;
};

type ProviderState = {
  provider: UsageProvider;
  instanceKey: string;
  seed: number;
  currentUsage: number;
  limit: number;
  periodStart: Date;
  periodEnd: Date;
  lastUpdated: Date;
  tick: number;
};

type ItemWindowState = {
  windowKey: string;
  used: number;
};

type BuiltSnapshot = {
  progress: ProgressItem[];
  cost?: ProviderCostSnapshot;
  plan?: string;
};

const stateStore = new Map<string, ProviderState>();
const itemWindowStore = new Map<string, ItemWindowState>();

const FIXED_PLANS: Partial<Record<UsageProvider, string>> = {
  [UsageProvider.ALIYUN]: 'Coding Plan',
  [UsageProvider.CODEX]: 'plus',
  [UsageProvider.COPILOT]: 'Business',
  [UsageProvider.CURSOR]: 'Pro',
  [UsageProvider.OPENROUTER]: 'Pay as you go',
  [UsageProvider.MINIMAX]: 'Max',
  [UsageProvider.ZAI]: 'Pro',
  [UsageProvider.KIMI]: 'Kimi Advanced',
  [UsageProvider.OLLAMA]: 'Pro',
};

function makeSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) + 1;
}

function seededUnit(seed: number, bucket: number, salt: number): number {
  const value = Math.sin(seed * 0.0001 + bucket * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveInstanceKey(provider: UsageProvider, instanceId?: string): string {
  const normalized = typeof instanceId === 'string' ? instanceId.trim() : '';
  return normalized || provider;
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / (1000 * 60)));
}

function nextDailyReset(now: Date): Date {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next;
}

function nextWeeklyReset(now: Date): Date {
  const next = new Date(now);
  const day = next.getDay();
  const offset = day === 0 ? 7 : 7 - day;
  next.setDate(next.getDate() + offset);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addHours(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function startOfWeekMonday(now: Date): Date {
  const next = new Date(now);
  const day = next.getDay(); // 0 Sun - 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfDay(now: Date): Date {
  const next = new Date(now);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getRollingWindow(now: Date, windowMinutes: number): { start: Date; end: Date } {
  const ms = windowMinutes * 60 * 1000;
  const dayStart = startOfDay(now);
  const elapsed = now.getTime() - dayStart.getTime();
  const slot = Math.floor(elapsed / ms);
  const start = new Date(dayStart.getTime() + slot * ms);
  const end = new Date(start.getTime() + ms);
  return { start, end };
}

function buildWindowKey(start: Date, end: Date): string {
  return `${Math.floor(start.getTime() / 1000)}:${Math.floor(end.getTime() / 1000)}`;
}

function resolveMonotonicWindowUsed(input: {
  key: string;
  seed: number;
  now: Date;
  start: Date;
  end: Date;
  limit: number;
  intensity?: number;
  floorPercent?: number;
}): number {
  const {
    key,
    seed,
    now,
    start,
    end,
    limit,
    intensity = 0.9,
    floorPercent = 0.01,
  } = input;

  const windowMs = Math.max(1, end.getTime() - start.getTime());
  const elapsedMs = clamp(now.getTime() - start.getTime(), 0, windowMs);
  const progress = elapsedMs / windowMs;
  const baseCurve = Math.pow(progress, 1.15);
  const slot = Math.floor(now.getTime() / (5 * 60 * 1000));
  const noise = 0.94 + seededUnit(seed, slot, 61) * 0.12;
  const day = now.getDay();
  const hour = now.getHours();
  const weekdayFactor = (day === 0 || day === 6) ? 0.84 : 1;
  const hourFactor = (hour >= 9 && hour <= 22) ? 1 : 0.76;
  const targetPercent = clamp(
    floorPercent + baseCurve * intensity * noise * weekdayFactor * hourFactor,
    0,
    0.995
  );
  const rawUsed = limit * targetPercent;

  const windowKey = buildWindowKey(start, end);
  const prev = itemWindowStore.get(key);
  if (!prev || prev.windowKey !== windowKey) {
    itemWindowStore.set(key, { windowKey, used: rawUsed });
    return rawUsed;
  }

  const used = Math.max(prev.used, rawUsed);
  itemWindowStore.set(key, { windowKey, used });
  return used;
}

function toProgressItem(input: {
  name: string;
  desc?: string;
  used: number;
  limit: number;
  resetsAt?: Date;
  windowMinutes?: number;
  resetDescription?: string;
}): ProgressItem {
  const limit = Math.max(input.limit, 1);
  const used = clamp(input.used, 0, limit);
  const usedPercent = roundPercentage((used / limit) * 100);

  return {
    name: input.name,
    desc: input.desc,
    used: roundPercentage(used),
    limit: roundPercentage(limit),
    usedPercent,
    remainingPercent: roundPercentage(100 - usedPercent),
    windowMinutes: input.windowMinutes,
    resetsAt: input.resetsAt,
    resetDescription: input.resetDescription,
  };
}

function toPercentItem(input: {
  name: string;
  desc?: string;
  usedPercent: number;
  resetsAt?: Date;
  windowMinutes?: number;
  resetDescription?: string;
  includeRemainingPercent?: boolean;
}): ProgressItem {
  const usedPercent = roundPercentage(clamp(input.usedPercent, 0, 100));
  const includeRemainingPercent = input.includeRemainingPercent !== false;
  return {
    name: input.name,
    desc: input.desc,
    usedPercent,
    ...(includeRemainingPercent ? { remainingPercent: roundPercentage(100 - usedPercent) } : {}),
    windowMinutes: input.windowMinutes,
    resetsAt: input.resetsAt,
    resetDescription: input.resetDescription,
  };
}

function getMiniMaxPlan(region: string | undefined, configLimit: number): { plan: string; promptLimit: number } {
  const isCN = region === 'cn' || region === 'china' || region === 'minimax_cn';
  const cnPlans = [
    { limit: 40, plan: 'Starter' },
    { limit: 100, plan: 'Plus' },
    { limit: 300, plan: 'Max' },
    { limit: 2000, plan: 'Ultra' },
  ];
  const globalPlans = [
    { limit: 100, plan: 'Starter' },
    { limit: 300, plan: 'Plus' },
    { limit: 1000, plan: 'Max' },
    { limit: 2000, plan: 'Ultra' },
  ];

  const plans = isCN ? cnPlans : globalPlans;
  const promptLimit = Math.max(1, Math.round(configLimit / 15));

  let nearest = plans[0];
  let bestDistance = Math.abs(promptLimit - nearest.limit);
  for (const plan of plans) {
    const distance = Math.abs(promptLimit - plan.limit);
    if (distance < bestDistance) {
      nearest = plan;
      bestDistance = distance;
    }
  }

  return { plan: nearest.plan, promptLimit: nearest.limit };
}

class GenericMockProvider {
  protected provider: UsageProvider;
  protected config: MockProviderConfig;
  protected instanceKey: string;

  constructor(options: MockProviderCtorOptions) {
    this.provider = options.provider;
    this.config = options.config;
    this.instanceKey = resolveInstanceKey(options.provider, options.instanceId);
  }

  private getInitialState(now: Date): ProviderState {
    const dates = getDefaultPeriodDates(this.config.periodType, this.config.resetDay);
    const seed = makeSeed(`${this.provider}:${this.instanceKey}`);
    const initialOffset = (seededUnit(seed, 1, 7) - 0.5) * this.config.limit * 0.08;
    const currentUsage = clamp(this.config.initialUsage + initialOffset, 0, this.config.limit * 0.7);

    return {
      provider: this.provider,
      instanceKey: this.instanceKey,
      seed,
      currentUsage,
      limit: this.config.limit,
      periodStart: dates.start,
      periodEnd: dates.end,
      lastUpdated: now,
      tick: 0,
    };
  }

  private advanceState(previous: ProviderState, now: Date): ProviderState {
    let state = { ...previous };

    while (now >= state.periodEnd) {
      const dates = getDefaultPeriodDates(this.config.periodType, this.config.resetDay);
      const rolloverBias = 0.85 + seededUnit(state.seed, state.tick + 5, 41) * 0.3;
      state = {
        ...state,
        currentUsage: clamp(this.config.initialUsage * rolloverBias, 0, this.config.limit * 0.5),
        periodStart: dates.start,
        periodEnd: dates.end,
        lastUpdated: now,
      };
    }

    const elapsedMinutes = Math.max(1, (now.getTime() - state.lastUpdated.getTime()) / (1000 * 60));
    const basePerMinute = Math.max(0, this.config.consumptionRate) / 60;

    const hour = now.getHours();
    const isPeakHour = (hour >= 9 && hour <= 12) || (hour >= 14 && hour <= 21);
    const isQuietHour = hour >= 1 && hour <= 6;
    const day = now.getDay();
    const isWeekend = day === 0 || day === 6;

    const quarterBucket = Math.floor(now.getTime() / (15 * 60 * 1000));
    const noise = 0.82 + seededUnit(state.seed, quarterBucket, 11) * 0.45;
    const spike = seededUnit(state.seed, quarterBucket, 23) > 0.985
      ? (1.8 + seededUnit(state.seed, quarterBucket, 29) * 1.7)
      : 1;

    const hourFactor = isPeakHour ? 1.2 : (isQuietHour ? 0.46 : 0.88);
    const weekdayFactor = isWeekend ? 0.72 : 1;
    const callDrift = 1 + (state.tick % 6) * 0.012;

    const increment = elapsedMinutes * basePerMinute * hourFactor * weekdayFactor * noise * spike * callDrift;
    const maxUsage = this.config.limit * 0.995;

    return {
      ...state,
      currentUsage: clamp(state.currentUsage + increment, 0, maxUsage),
      lastUpdated: now,
      tick: state.tick + 1,
    };
  }

  private getState(now: Date): ProviderState {
    const existing = stateStore.get(this.instanceKey);
    const next = this.advanceState(existing || this.getInitialState(now), now);
    stateStore.set(this.instanceKey, next);
    return next;
  }

  private buildSnapshot(state: ProviderState, region?: string): BuiltSnapshot {
    const periodWindowMinutes = minutesBetween(state.periodStart, state.periodEnd);
    const now = state.lastUpdated;

    switch (this.provider) {
      case UsageProvider.OPENROUTER: {
        const monthlyLimit = state.limit;
        const monthlyUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:openrouter:monthly`,
          seed: state.seed,
          now,
          start: state.periodStart,
          end: state.periodEnd,
          limit: monthlyLimit,
          intensity: 0.86,
        });
        const totalLimit = state.limit;
        const totalUsed = clamp(state.currentUsage, 0, totalLimit);
        return {
          plan: FIXED_PLANS[this.provider],
          progress: [
            toProgressItem({
              name: 'Monthly Credits',
              desc: '30 days window',
              used: monthlyUsed,
              limit: monthlyLimit,
              resetsAt: state.periodEnd,
            }),
            toProgressItem({
              name: 'Total Credits',
              desc: 'total window',
              used: totalUsed,
              limit: totalLimit,
            }),
          ],
          cost: {
            used: roundPercentage(totalUsed * 100) / 100,
            limit: roundPercentage(totalLimit * 100) / 100,
            remaining: roundPercentage(Math.max(0, totalLimit - totalUsed) * 100) / 100,
            currency: 'USD',
            period: 'monthly',
          },
        };
      }

      case UsageProvider.MINIMAX: {
        const minimax = getMiniMaxPlan(region, state.limit);
        const promptUsed = Math.round(resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:minimax:prompt`,
          seed: state.seed,
          now,
          start: state.periodStart,
          end: state.periodEnd,
          limit: minimax.promptLimit,
          intensity: 0.88,
        }));
        return {
          plan: minimax.plan,
          progress: [
            toProgressItem({
              name: 'Prompt',
              desc: `${periodWindowMinutes >= 7 * 24 * 60 ? `${Math.round(periodWindowMinutes / (7 * 24 * 60))} week` : `${Math.round(periodWindowMinutes / (24 * 60))} days`} window for models: MiniMax-Text-01`,
              used: promptUsed,
              limit: minimax.promptLimit,
              resetsAt: state.periodEnd,
              windowMinutes: periodWindowMinutes,
            }),
          ],
        };
      }

      case UsageProvider.KIMI: {
        const weeklyLimit = Math.max(1200, Math.round(state.limit * 0.85));
        const weeklyWindow = { start: startOfWeekMonday(now), end: nextWeeklyReset(now) };
        const weeklyUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:kimi:weekly`,
          seed: state.seed,
          now,
          start: weeklyWindow.start,
          end: weeklyWindow.end,
          limit: weeklyLimit,
          intensity: 0.86,
        });
        const rateLimit = 200;
        const rolling5h = getRollingWindow(now, 300);
        const rateUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:kimi:rate`,
          seed: state.seed + 17,
          now,
          start: rolling5h.start,
          end: rolling5h.end,
          limit: rateLimit,
          intensity: 0.93,
        });
        return {
          plan: FIXED_PLANS[this.provider],
          progress: [
            toProgressItem({
              name: 'Weekly',
              desc: '7 days window',
              used: weeklyUsed,
              limit: weeklyLimit,
              resetsAt: weeklyWindow.end,
              windowMinutes: 7 * 24 * 60,
            }),
            toProgressItem({
              name: 'Rate Limit',
              desc: '5 hours window',
              used: rateUsed,
              limit: rateLimit,
              resetsAt: rolling5h.end,
              windowMinutes: 300,
            }),
          ],
        };
      }

      case UsageProvider.COPILOT: {
        const chatLimit = Math.max(1200, Math.round(state.limit * 0.6));
        const premiumLimit = Math.max(600, Math.round(state.limit * 0.3));
        const chatUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:copilot:chat`,
          seed: state.seed,
          now,
          start: state.periodStart,
          end: state.periodEnd,
          limit: chatLimit,
          intensity: 0.9,
        });
        const premiumUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:copilot:premium`,
          seed: state.seed + 7,
          now,
          start: state.periodStart,
          end: state.periodEnd,
          limit: premiumLimit,
          intensity: 0.78,
        });
        const copilotWindowDays = Math.round(periodWindowMinutes / (24 * 60));
        const copilotWindowDesc = `${copilotWindowDays} ${copilotWindowDays === 1 ? 'day' : 'days'} window`;
        return {
          plan: FIXED_PLANS[this.provider],
          progress: [
            toProgressItem({
              name: 'Chat',
              desc: copilotWindowDesc,
              used: chatUsed,
              limit: chatLimit,
              resetsAt: state.periodEnd,
              windowMinutes: periodWindowMinutes,
              resetDescription: 'Monthly reset',
            }),
            toProgressItem({
              name: 'Premium',
              desc: copilotWindowDesc,
              used: premiumUsed,
              limit: premiumLimit,
              resetsAt: state.periodEnd,
              windowMinutes: periodWindowMinutes,
              resetDescription: 'Monthly reset',
            }),
          ],
        };
      }

      case UsageProvider.CURSOR: {
        const planLimit = Math.max(400, Math.round(state.limit * 0.95));
        const onDemandLimit = Math.max(100, Math.round(state.limit * 0.28));
        const planUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:cursor:plan`,
          seed: state.seed,
          now,
          start: state.periodStart,
          end: state.periodEnd,
          limit: planLimit,
          intensity: 0.9,
        });
        const onDemandUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:cursor:ondemand`,
          seed: state.seed + 13,
          now,
          start: state.periodStart,
          end: state.periodEnd,
          limit: onDemandLimit,
          intensity: 0.72,
        });
        const cursorPlanDays = Math.round(periodWindowMinutes / (24 * 60));
        const cursorPlanDesc = `${cursorPlanDays} ${cursorPlanDays === 1 ? 'day' : 'days'} window`;
        return {
          plan: FIXED_PLANS[this.provider],
          progress: [
            toProgressItem({
              name: 'Plan',
              desc: cursorPlanDesc,
              used: planUsed,
              limit: planLimit,
              resetsAt: state.periodEnd,
              windowMinutes: periodWindowMinutes,
            }),
            toProgressItem({
              name: 'Secondary',
              desc: '7 days window',
              used: onDemandUsed,
              limit: onDemandLimit,
              resetsAt: nextWeeklyReset(now),
              windowMinutes: 7 * 24 * 60,
            }),
          ],
        };
      }

      case UsageProvider.CODEX: {
        const sessionLimit = 100;
        const rolling5h = getRollingWindow(now, 300);
        const sessionUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:codex:session`,
          seed: state.seed,
          now,
          start: rolling5h.start,
          end: rolling5h.end,
          limit: sessionLimit,
          intensity: 0.95,
        });
        const weeklyLimit = 700;
        const weeklyWindow = { start: startOfWeekMonday(now), end: nextWeeklyReset(now) };
        const weeklyUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:codex:weekly`,
          seed: state.seed + 19,
          now,
          start: weeklyWindow.start,
          end: weeklyWindow.end,
          limit: weeklyLimit,
          intensity: 0.88,
        });
        const additionalSessionLimit = 80;
        const additionalSessionUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:codex:additional_session`,
          seed: state.seed + 27,
          now,
          start: rolling5h.start,
          end: rolling5h.end,
          limit: additionalSessionLimit,
          intensity: 0.05,
          floorPercent: 0,
        });
        const additionalWeeklyLimit = 350;
        const additionalWeeklyUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:codex:additional_weekly`,
          seed: state.seed + 33,
          now,
          start: weeklyWindow.start,
          end: weeklyWindow.end,
          limit: additionalWeeklyLimit,
          intensity: 0.06,
          floorPercent: 0,
        });
        const codeReviewLimit = 200;
        const codeReviewUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:codex:code_review`,
          seed: state.seed + 39,
          now,
          start: weeklyWindow.start,
          end: weeklyWindow.end,
          limit: codeReviewLimit,
          intensity: 0.05,
          floorPercent: 0,
        });
        return {
          plan: FIXED_PLANS[this.provider],
          progress: [
            toPercentItem({
              name: 'Session',
              desc: '5 hours window',
              usedPercent: (sessionUsed / sessionLimit) * 100,
              resetsAt: rolling5h.end,
              windowMinutes: 300,
            }),
            toPercentItem({
              name: 'Weekly',
              desc: '1 week window',
              usedPercent: (weeklyUsed / weeklyLimit) * 100,
              resetsAt: weeklyWindow.end,
              windowMinutes: 7 * 24 * 60,
            }),
            toPercentItem({
              name: 'Additional Session',
              desc: '5 hours window for GPT-5.3-Codex-Spark',
              usedPercent: (additionalSessionUsed / additionalSessionLimit) * 100,
              resetsAt: rolling5h.end,
              windowMinutes: 300,
            }),
            toPercentItem({
              name: 'Additional Weekly',
              desc: '1 week window for GPT-5.3-Codex-Spark',
              usedPercent: (additionalWeeklyUsed / additionalWeeklyLimit) * 100,
              resetsAt: weeklyWindow.end,
              windowMinutes: 7 * 24 * 60,
            }),
            toPercentItem({
              name: 'Code Review',
              desc: '1 week window',
              usedPercent: (codeReviewUsed / codeReviewLimit) * 100,
              resetsAt: weeklyWindow.end,
              windowMinutes: 7 * 24 * 60,
            }),
          ],
        };
      }

      case UsageProvider.OPENCODE: {
        const primaryLimit = 100;
        const secondaryLimit = 100;
        const rolling5h = getRollingWindow(now, 300);
        const weeklyWindow = { start: startOfWeekMonday(now), end: nextWeeklyReset(now) };
        const primaryUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:opencode:primary`,
          seed: state.seed,
          now,
          start: rolling5h.start,
          end: rolling5h.end,
          limit: primaryLimit,
          intensity: 0.93,
        });
        const secondaryUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:opencode:secondary`,
          seed: state.seed + 17,
          now,
          start: weeklyWindow.start,
          end: weeklyWindow.end,
          limit: secondaryLimit,
          intensity: 0.84,
        });
        return {
          plan: FIXED_PLANS[this.provider],
          progress: [
            toPercentItem({
              name: 'Primary',
              usedPercent: (primaryUsed / primaryLimit) * 100,
              resetsAt: rolling5h.end,
              windowMinutes: 5 * 60,
            }),
            toPercentItem({
              name: 'Secondary',
              usedPercent: (secondaryUsed / secondaryLimit) * 100,
              resetsAt: weeklyWindow.end,
              windowMinutes: 7 * 24 * 60,
            }),
          ],
        };
      }

      case UsageProvider.OLLAMA: {
        const sessionLimit = 100;
        const weeklyLimit = 100;
        const rolling5h = getRollingWindow(now, 300);
        const weeklyWindow = { start: startOfWeekMonday(now), end: nextWeeklyReset(now) };
        const sessionUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:ollama:session`,
          seed: state.seed,
          now,
          start: rolling5h.start,
          end: rolling5h.end,
          limit: sessionLimit,
          intensity: 0.75,
        });
        const weeklyUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:ollama:weekly`,
          seed: state.seed + 11,
          now,
          start: weeklyWindow.start,
          end: weeklyWindow.end,
          limit: weeklyLimit,
          intensity: 0.8,
        });
        return {
          plan: FIXED_PLANS[this.provider],
          progress: [
            toPercentItem({
              name: 'Session',
              desc: '',
              usedPercent: (sessionUsed / sessionLimit) * 100,
              resetsAt: rolling5h.end,
            }),
            toPercentItem({
              name: 'Weekly',
              desc: '',
              usedPercent: (weeklyUsed / weeklyLimit) * 100,
              resetsAt: weeklyWindow.end,
            }),
          ],
        };
      }

      case UsageProvider.ZAI: {
        const sessionLimit = 100;
        const weeklyLimit = 100;
        const webSearchLimit = 80;
        const rolling5h = getRollingWindow(now, 300);
        const weeklyWindow = { start: startOfWeekMonday(now), end: nextWeeklyReset(now) };
        const dailyWindow = { start: startOfDay(now), end: nextDailyReset(now) };
        const sessionUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:zai:session`,
          seed: state.seed,
          now,
          start: rolling5h.start,
          end: rolling5h.end,
          limit: sessionLimit,
          intensity: 0.9,
        });
        const weeklyUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:zai:weekly`,
          seed: state.seed + 5,
          now,
          start: weeklyWindow.start,
          end: weeklyWindow.end,
          limit: weeklyLimit,
          intensity: 0.78,
        });
        const webSearchUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:zai:web`,
          seed: state.seed + 23,
          now,
          start: dailyWindow.start,
          end: dailyWindow.end,
          limit: webSearchLimit,
          intensity: 0.7,
        });
        return {
          plan: FIXED_PLANS[this.provider],
          progress: [
            toProgressItem({
              name: 'Session',
              used: sessionUsed,
              limit: sessionLimit,
              resetsAt: rolling5h.end,
              windowMinutes: 300,
            }),
            toProgressItem({
              name: 'Weekly',
              used: weeklyUsed,
              limit: weeklyLimit,
              resetsAt: weeklyWindow.end,
              windowMinutes: 7 * 24 * 60,
            }),
            toProgressItem({
              name: 'Web Searches',
              used: webSearchUsed,
              limit: webSearchLimit,
              resetsAt: dailyWindow.end,
              windowMinutes: 24 * 60,
            }),
          ],
        };

      }

      case UsageProvider.ALIYUN: {
        const fiveHourLimit = Math.max(120, Math.round(state.limit * 0.08));
        const weeklyLimit = Math.max(800, Math.round(state.limit * 0.42));
        const monthlyLimit = state.limit;
        const rolling5h = getRollingWindow(now, 300);
        const weeklyWindow = { start: startOfWeekMonday(now), end: nextWeeklyReset(now) };
        const fiveHourUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:aliyun:5h`,
          seed: state.seed,
          now,
          start: rolling5h.start,
          end: rolling5h.end,
          limit: fiveHourLimit,
          intensity: 0.92,
        });
        const weeklyUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:aliyun:weekly`,
          seed: state.seed + 7,
          now,
          start: weeklyWindow.start,
          end: weeklyWindow.end,
          limit: weeklyLimit,
          intensity: 0.87,
        });
        const monthlyUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:aliyun:monthly`,
          seed: state.seed + 13,
          now,
          start: state.periodStart,
          end: state.periodEnd,
          limit: monthlyLimit,
          intensity: 0.9,
        });

        return {
          plan: FIXED_PLANS[this.provider],
          progress: [
            toProgressItem({
              name: 'Session',
              desc: '5 hours window',
              used: fiveHourUsed,
              limit: fiveHourLimit,
              resetsAt: rolling5h.end,
              windowMinutes: 300,
            }),
            toProgressItem({
              name: 'Weekly',
              desc: '7 days window',
              used: weeklyUsed,
              limit: weeklyLimit,
              resetsAt: weeklyWindow.end,
              windowMinutes: 7 * 24 * 60,
            }),
            toProgressItem({
              name: 'Monthly',
              desc: '30 days window',
              used: monthlyUsed,
              limit: monthlyLimit,
              resetsAt: state.periodEnd,
              windowMinutes: periodWindowMinutes,
            }),
          ],
        };
      }

      case UsageProvider.CLAUDE:
      default: {
        const rolling5h = getRollingWindow(now, 300);
        const weeklyWindow = { start: startOfWeekMonday(now), end: nextWeeklyReset(now) };
        const primaryUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:${this.provider}:primary`,
          seed: state.seed,
          now,
          start: this.provider === UsageProvider.CLAUDE ? rolling5h.start : state.periodStart,
          end: this.provider === UsageProvider.CLAUDE ? rolling5h.end : state.periodEnd,
          limit: state.limit,
          intensity: 0.9,
        });
        const secondaryLimit = Math.max(1, state.limit * 0.35);
        const secondaryUsed = resolveMonotonicWindowUsed({
          key: `${this.instanceKey}:${this.provider}:secondary`,
          seed: state.seed + 17,
          now,
          start: weeklyWindow.start,
          end: weeklyWindow.end,
          limit: secondaryLimit,
          intensity: 0.82,
        });
        const progress: ProgressItem[] = [
          toProgressItem({
            name: this.provider === UsageProvider.CLAUDE ? 'Session' : 'Primary',
            desc: this.provider === UsageProvider.CLAUDE ? '5 hours window' : undefined,
            used: primaryUsed,
            limit: state.limit,
            resetsAt: this.provider === UsageProvider.CLAUDE ? rolling5h.end : state.periodEnd,
            windowMinutes: this.provider === UsageProvider.CLAUDE ? 300 : periodWindowMinutes,
          }),
        ];

        if (this.provider === UsageProvider.CLAUDE) {
          progress.push(
            toPercentItem({
              name: 'Weekly',
              desc: '1 week window',
              usedPercent: (secondaryUsed / secondaryLimit) * 100,
              resetsAt: weeklyWindow.end,
              windowMinutes: 7 * 24 * 60,
              includeRemainingPercent: false,
            })
          );
          progress[0] = toPercentItem({
            name: 'Session',
            desc: '5 hours window',
            usedPercent: (primaryUsed / state.limit) * 100,
            resetsAt: rolling5h.end,
            windowMinutes: 300,
            includeRemainingPercent: false,
          });
        }

        return {
          plan: FIXED_PLANS[this.provider],
          progress,
        };
      }
    }
  }

  async fetchUsageAt(_credentials: Credential, region: string | undefined, now: Date): Promise<UsageSnapshot> {
    const state = this.getState(now);
    const built = this.buildSnapshot(state, region);

    return {
      provider: this.provider,
      progress: built.progress,
      cost: built.cost,
      updatedAt: now,
      identity: built.plan ? { plan: built.plan } : undefined,
    };
  }

  async fetchUsage(credentials: Credential, region?: string): Promise<UsageSnapshot> {
    return this.fetchUsageAt(credentials, region, new Date());
  }
}

export class ClaudeMockProvider extends GenericMockProvider {}
export class CopilotMockProvider extends GenericMockProvider {}
export class CursorMockProvider extends GenericMockProvider {}
export class OpenRouterMockProvider extends GenericMockProvider {}
export class MiniMaxMockProvider extends GenericMockProvider {}
export class KimiMockProvider extends GenericMockProvider {}
export class CodexMockProvider extends GenericMockProvider {}
export class OpenCodeMockProvider extends GenericMockProvider {}
export class OllamaMockProvider extends GenericMockProvider {}
export class ZaiMockProvider extends GenericMockProvider {}
