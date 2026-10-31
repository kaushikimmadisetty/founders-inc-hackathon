# Prior work disclosure

Per Night Hack rules, this lists everything that existed before kickoff. Judges should score only what was built during the sprint.

## Existed before kickoff

- **masterpi-mujoco**: Adnan's existing MuJoCo model of a Hiwonder MasterPi mecanum arm car. Not copied into this repo at scaffold time. If it is adapted for the `mecanum_arm` template, the adapted files will be listed here with the commit that introduced them.
- General MuJoCo / RL / agent engineering experience of the team. No other pre-existing code.

## Built during the sprint (everything in this repo)

- Pydantic contracts, planner / parts / body / board / brain / critic agents and prompts
- Orchestrator with parallel agents, assembler, MuJoCo sim gate, critic routing loop
- Parametric MJCF templates (diff drive rover, mecanum base, mecanum arm) and task library
- Fallback controllers, sandboxed controller execution, catalog of ~35 hobby parts
- Parametric chassis generator (CadQuery, with pure Python STL fallback), fallback PCB renderer
- FastAPI backend, Convex schema and functions, Next.js frontend with 3D replay viewer
- Photon (iMessage) and Firecrawl adapters

## Tools and services used

Anthropic Claude (agents), Photon (iMessage), HeyPCB (carrier PCB), Firecrawl (part scraping), Convex (realtime state), MuJoCo, CadQuery, FastAPI, Next.js, Vercel.
