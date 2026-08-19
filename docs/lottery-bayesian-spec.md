# Lottery Bayesian Pool Spec

## Goal

Estimate each pool's unknown base ticket count `B`, keep the full posterior
distribution `P(B | D)`, and recommend ticket allocations that maximize the
probability of at least one win across multiple pools.

## Pool Model

Each historical observation for a pool is:

- `x`: our submitted tickets
- `y`: win indicator in `{0, 1}`

Likelihood:

- `P(win | B, x) = x / (B + x)`
- `P(lose | B, x) = B / (B + x)`

We use a discrete Bayesian posterior over `B in {0, ..., B_max}`.

## Prior Families

- `uniform`
- `poisson`
- `negative_binomial`
- `empirical`

`empirical` is built from a smoothed histogram of pool-size point estimates
across historical pool groups. The inference engine remains discrete Bayesian
updating for every prior family.

## Model Selection

For a set of pool histories, compare candidate priors with leave-one-observation-out
predictive log score. The winner becomes the selected prior family for that
history window.

## Pool Summary Output

For each pool template `(weekday, time, court)` return:

- posterior mean of base tickets
- posterior standard deviation
- MAP estimate
- 80% credible interval
- predictive win probabilities for ticket counts `1..5`
- total bids, total wins, attempts

For target-month candidate pools `(date, weekday, time, court)` inherit the
posterior of the matching template pool.

## Allocation Objective

Given independent pools and allocation vector `x = (x1, ..., xn)`:

- `P(lose at pool i) = sum_B [B / (B + xi)] P(B_i = B | D_i)`
- `P(at least one win) = 1 - product_i P(lose at pool i)`

Exact optimization is done with dynamic programming over:

- number of candidate pools
- total available tickets `K`
- per-pool cap (currently `5`)

The DP keeps the top `N` partial allocations per state so it can return the
best recommendation and several alternative strategies.

## Information Value

For any candidate pool and hypothetical action `x`, compute expected
information gain:

- `EIG(x) = H(P(B | D)) - E_y[H(P(B | D, x, y))]`

This is returned as supporting analysis, not the primary optimization
objective in the first implementation.

## API Shape

`/api/lottery_dashboard`

- `selected`
  - `months_used`
  - `skipped_months`
  - `model`
  - `pool_summaries`
- `all_time`
  - same shape as `selected`
- `strategy`
  - `target_month`
  - `selected`
    - `available_tickets`
    - `recommended_allocation`
    - `alternatives`
    - `candidate_pools`
    - `explanation`
  - `all_time`
    - same shape as `selected`

## Cleanup

Remove obsolete placeholder routes:

- `/api/probability/<month_id>`
- `/api/strategy`
