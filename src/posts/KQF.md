---
date: 2024-09-09
---
# KQF: An alternative approach to resource allocation
Special thanks to Avsa, Danimim and Kevin Owocki for the feedback and discussions

## TL;DR 
This post introduces Knapsack Quadratic Funding (KQF). KQF aims to complement QF by improving accountability to grantees and efficient resource allocation.

![kqf](https://hackmd.io/_uploads/HJnJ2UXnA.jpg =30%x)

## Current challenges in funding new projects

After participating in Zuzalu QF rounds as a donor and grantee, some challenges became clear.

When organizing events or launching **new** tools, two main issues often arise with traditional QF:

1. **Underfunding**: A project might receive a significant amount of funding that's still insufficient for its needs, creating uncertainty about how to proceed.

2. **Overfunding**: Conversely, a project may receive more funding than necessary, leading to inefficient resource allocation.

These scenarios suggest that there might be room for improvement in our funding mechanisms, especially for projects with clearly defined budgetary needs.

## Introducing Knapsack Quadratic Funding (KQF)

KQF draws inspiration from the Knapsack problem[^1], a concept in combinatorial optimization. This approach has already seen application in the blockchain space, notably in the ENS community's recent distribution of $3.6 million to service providers[^2].

The proposed KQF mechanism works as follows:

1. Set a total budget (e.g., 250 ETH).
2. Projects submit funding requests specifying their exact needs.
3. A standard donation round is conducted.
4. Post-donation, apply the KQF algorithm:
   - Sort projects by their matching value (highest to lowest).
   - For each project, if its "fulfillment amount" (`requested amount - donations received`) fits within the remaining budget, it receives funding.
   - The process stops when no more projects can be fully funded.
   - Any remaining funds are returned to the source.

Here's a visual representation of the process:

![KQF Distribution Process](https://hackmd.io/_uploads/B1toguGtA.png)

## Potential advantages of KQF

1. **Incentive Alignment**: Projects receive only what they ask for minus donations, discouraging inflated requests.
2. **Efficient Resource Use**: By fully funding projects or not at all, we ensure that funded projects have sufficient resources to execute their plans.
3. **Fair Asking**: The all-or-nothing nature encourages projects to request only what they truly need.
4. **Execution Commitment**: Funded projects receive their full asked amount, creating a stronger obligation to deliver on their promises.

## Possible refinements

To further optimize the KQF mechanism, consider:

- **Minimum Funding Cap**: This could prevent projects from gaming the system by asking for extremely small amounts.
- **Maximum Funding Cap**: To ensure a single project doesn't consume an outsized portion of the budget.

## Implementation considerations

Adopting KQF would require some adjustments to current QF funding structures:

1. Projects would need to specify exact budget requirements.
2. The matching fund distribution would occur after the donation period, following the KQF algorithm.

## Open questions and future work

While KQF shows promise, several questions remain:

1. How might this mechanism impact donor behavior compared to traditional QF?
2. What are the potential game-theoretic implications of the all-or-nothing funding approach?
3. How can we ensure that the sorting algorithm doesn't unfairly disadvantage smaller or newer projects?

Further research and possibly some simulations or small-scale trials could help answer these questions and refine the KQF concept.

Feedback and critiques from the community will be crucial in evaluating and improving this proposal. The goal is to continue evolving our funding mechanisms to better serve the needs of both project creators and donors in the ecosystem.

*[QF]: Quadratic Funding
*[KQF]: Knapsack Quadratic Funding
*[ENS]: Ethereum Name Service

[^1]: https://developers.google.com/optimization/pack/knapsack
[^2]: https://discuss.ens.domains/t/temp-check-proposal-for-new-service-provider-streams/18044
