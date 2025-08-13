// Policy / Permissions Engine - Phase B scaffold
// Scopes, rate limits, domain rules, and plan validation

const ALLOWED_TYPES = new Set(['navigate','scrollBy','scrollTo','click','type','pressEnter','waitFor']);

export function validatePlan(plan = []) {
  const errors = [];
  if (!Array.isArray(plan)) return { ok: false, errors: ['PLAN_NOT_ARRAY'] };
  const sanitized = plan.map((step, idx) => {
    const t = String(step?.type||'');
    if (!ALLOWED_TYPES.has(t)) errors.push(`step ${idx+1}: UNKNOWN_TYPE ${t}`);
    if (t === 'navigate' && !/^https?:\/\//i.test(String(step.url||''))) errors.push(`step ${idx+1}: BAD_URL`);
    if ((t === 'click' || t === 'type') && !step.selector && !step.textContains) errors.push(`step ${idx+1}: NEED_SELECTOR_OR_TEXT`);
    return step;
  });
  return { ok: errors.length===0, errors, plan: sanitized };
}

export async function requestApproval(ui, planSummary, plan) {
  // ui is a renderer-side hook. Here we just pass-through.
  return ui?.(planSummary, plan);
}

export default { validatePlan, requestApproval };
