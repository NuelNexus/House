// ============================================================
// FesGH — shared helpers (no demo content)
//
// The site shows only real user-inputted content: parties,
// tickets, reviews, posts and hypes all come from Supabase /
// user accounts. This file only holds small shared utilities.
// ============================================================

// Format a number as Ghana cedis for display.
export const GH_CD = (n) => `GH₵ ${n.toLocaleString()}`;
