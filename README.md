# Least Wanted

A Need for Speed: Most Wanted style street racer that runs in the browser. Open city, police pursuits with heat levels, roadblocks, a five-driver Blacklist, and a garage. No backend, no assets to download: the city, cars, traffic and sounds are all generated in code.

## Stack

- [Vite](https://vitejs.dev) + TypeScript for the build
- [Three.js](https://threejs.org) for rendering: a procedurally generated city merged into a handful of draw calls, lit windows, a dusk sky with image-based environment lighting, soft shadows and bloom post-processing
- WebAudio for the engine, sirens, tire squeal and every other sound

## Run locally

```sh
npm install
npm run dev
```

Open the URL Vite prints and press **Free Roam**.

## Controls

| Key | Action |
| --- | --- |
| W / ↑ | Accelerate |
| S / ↓ | Brake, reverse |
| A D / ← → | Steer |
| Space | Handbrake (drift) |
| Shift | Nitrous |
| C | Toggle chase / hood camera |
| R | Reset the car to the road |
| Esc | Menu / pause |
| F | Toggle FPS counter |
| Enter | Skip race results |

## Menu

- **Free Roam** drops you into the city.
- **Blacklist** lists the five rivals. Beat them in order, from #5 to #1, in sprint races through checkpoints.
- **Garage** picks your car (hot hatch, muscle, exotic) and paint.
- **Records** shows career stats, stored in the browser.
- **Settings** has volume, graphics quality, camera and the colorway. The pill in the top-right corner cycles colorways too.

## Gameplay

**Pursuits.** Patrol cars roam the city. Speed past one and the pursuit starts. Heat rises the longer it goes on: more units, faster cruisers, and from heat 3 up, roadblocks ahead of you. Bounty ticks up every second and jumps when you wreck a cruiser. Get far enough away to fill the **Evade** meter, then stay out of sight through the cooldown to bank the bounty. Stop next to a cruiser and the **Busted** meter fills instead; get busted and the bounty is gone.

**Races.** Each Blacklist rival is a point-to-point sprint. Drive through every checkpoint in order and cross the line first. Cops stay out of races.

**Driving.** Handbrake to kick the tail out, drift to refill nitrous faster, and squeeze past traffic for a near-miss nitrous bonus. Damage adds up; a totaled car in a pursuit means busted.

## Graphics quality

The settings menu has a graphics selector, saved in the browser:

- **High**: bloom, 4K shadow map
- **Medium**: bloom, 2K shadow map
- **Low**: no post-processing, 1K shadow map
