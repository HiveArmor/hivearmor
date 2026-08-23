/**
 * AgenticReasoningFabric — presentation-only ambient intelligence network.
 * Metaphor: telemetry → correlation → reasoning → governed response.
 * Shared 20s cycle with AgentStateIndicator. CSS/SVG only. Respects prefers-reduced-motion.
 */

import './AgenticReasoningFabric.css';

export function AgenticReasoningFabric(): JSX.Element {
  return (
    <div className="agentic-fabric" aria-hidden="true">
      <div className="agentic-fabric__glow agentic-fabric__glow--warm" />
      <div className="agentic-fabric__glow agentic-fabric__glow--cool" />

      <svg className="agentic-fabric__svg" viewBox="0 0 1200 720" preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <linearGradient id="agenticStroke" x1="0%" y1="0%" x2="100%" y2="40%">
            <stop offset="0%" stopColor="var(--ha-brand-primary)" stopOpacity="0.75" />
            <stop offset="70%" stopColor="var(--ha-brand-hot)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--ha-brand-hot)" stopOpacity="0.12" />
          </linearGradient>
          <radialGradient id="reasonGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--ha-brand-primary)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--ha-brand-primary)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Selective hex cells — irregular hive, not wallpaper */}
        <g fill="none" stroke="url(#agenticStroke)" strokeWidth="1.05">
          <path className="agentic-fabric__hex agentic-fabric__hex--a" d="M140 110 L190 139 V197 L140 226 L90 197 V139 Z" />
          <path className="agentic-fabric__hex agentic-fabric__hex--b" d="M240 156 L290 185 V243 L240 272 L190 243 V185 Z" />
          <path className="agentic-fabric__hex agentic-fabric__hex--c" d="M340 98 L390 127 V185 L340 214 L290 185 V127 Z" />
          <path className="agentic-fabric__hex agentic-fabric__hex--d" d="M190 268 L240 297 V355 L190 384 L140 355 V297 Z" />
          <path className="agentic-fabric__hex agentic-fabric__hex--e" d="M320 290 L370 319 V377 L320 406 L270 377 V319 Z" />
          <path className="agentic-fabric__hex agentic-fabric__hex--f" d="M430 210 L480 239 V297 L430 326 L380 297 V239 Z" />
          <path className="agentic-fabric__hex agentic-fabric__hex--g" d="M390 380 L440 409 V467 L390 496 L340 467 V409 Z" />
          <path className="agentic-fabric__hex agentic-fabric__hex--h" d="M520 300 L570 329 V387 L520 416 L470 387 V329 Z" />
        </g>

        {/* Correlation paths — fade toward auth region */}
        <g fill="none" stroke="url(#agenticStroke)" strokeWidth="1.1" strokeLinecap="round">
          <path className="agentic-fabric__path agentic-fabric__path--telemetry" d="M90 168 H190 M190 168 V214 M190 214 H290" />
          <path className="agentic-fabric__path agentic-fabric__path--correlate" d="M290 214 V290 M290 290 H370 M370 290 V340" />
          <path className="agentic-fabric__path agentic-fabric__path--reason" d="M370 340 H460 M460 340 V360" />
          <path className="agentic-fabric__path agentic-fabric__path--bridge" d="M520 360 H680 M680 360 H760" />
          <path className="agentic-fabric__path agentic-fabric__path--alt" d="M240 320 H320 M320 320 V380" />
        </g>

        {/* Evidence / context nodes */}
        <g fill="var(--ha-brand-primary)">
          <circle className="agentic-fabric__node agentic-fabric__node--1" cx="140" cy="168" r="3" />
          <circle className="agentic-fabric__node agentic-fabric__node--2" cx="190" cy="214" r="3" />
          <circle className="agentic-fabric__node agentic-fabric__node--3" cx="290" cy="214" r="3.2" />
          <circle className="agentic-fabric__node agentic-fabric__node--4" cx="370" cy="290" r="3" />
          <circle className="agentic-fabric__node agentic-fabric__node--5" cx="320" cy="380" r="2.8" />
          <circle className="agentic-fabric__node agentic-fabric__node--6" cx="520" cy="360" r="3" />
        </g>

        {/* Reasoning node — slightly more important, still restrained */}
        <g className="agentic-fabric__reason">
          <circle className="agentic-fabric__reason-glow" cx="460" cy="360" r="18" fill="url(#reasonGlow)" />
          <circle className="agentic-fabric__reason-ring" cx="460" cy="360" r="8" fill="none" stroke="var(--ha-brand-primary)" strokeWidth="1" />
          <circle className="agentic-fabric__reason-core" cx="460" cy="360" r="4.2" fill="var(--ha-brand-hot)" />
        </g>
      </svg>

      {/* Telemetry in → decision out (HTML for reliable CSS motion) */}
      <span className="agentic-fabric__signal agentic-fabric__signal--in" />
      <span className="agentic-fabric__signal agentic-fabric__signal--out" />
    </div>
  );
}
