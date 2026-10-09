import React, { useEffect, useRef, useState } from "react";
import { colors, sampleAt, time, valuesText } from "./model.mjs";
export default function Timeline({ report, onEvidence }) {
  const ref = useRef(null),
    [width, setWidth] = useState(900),
    [at, setAt] = useState(
      Date.parse(report.events[0]?.at || report.window.start),
    ),
    [hover, setHover] = useState(null),
    [pinned, setPinned] = useState(false),
    [selected, setSelected] = useState(null);
  const start = Date.parse(report.window.start),
    end = Date.parse(report.window.end),
    left = 44,
    right = 18,
    top = 40,
    height = width < 480 ? 220 : 270,
    bottom = height - 49;
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(220, entry.contentRect.width)),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const close = (e) => {
      if (e.key === "Escape") {
        setHover(null);
        setPinned(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const x = (t) =>
    left + ((width - left - right) * (t - start)) / (end - start);
  const metrics = report.metrics.map((m, i) => {
    const values = m.points.filter((p) => p[1] !== null).map((p) => p[1]);
    const low = Math.min(0, ...values),
      high = Math.max(0, ...values);
    return {
      ...m,
      color: colors[i % colors.length],
      low,
      actualMin: values.length ? Math.min(...values) : null,
      actualMax: values.length ? Math.max(...values) : null,
      high: high === low ? high + 1 : high,
    };
  });
  const y = (m, v) =>
    bottom - ((bottom - top) * (v - m.low)) / (m.high - m.low);
  const path = (m) => {
    let d = "",
      previous = null;
    for (const [t, v] of m.points) {
      const n = Date.parse(t);
      if (v === null) {
        previous = null;
        continue;
      }
      d +=
        (previous === null || n - previous > m.interval_seconds * 1500
          ? "M"
          : "L") +
        x(n) +
        " " +
        y(m, v) +
        " ";
      previous = n;
    }
    return d;
  };
  function pointer(e) {
    const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
    return Math.max(
      start,
      Math.min(
        end,
        start +
          ((e.clientX - box.left - left) / (width - left - right)) *
            (end - start),
      ),
    );
  }
  function choose(event) {
    setSelected(event.id);
    setAt(Date.parse(event.at));
    setHover(Date.parse(event.at));
    setPinned(true);
  }
  const ticks = width < 480 ? 4 : 6,
    active = hover ?? at,
    event = report.events.find((e) => e.id === selected);
  return (
    <section className="section" aria-label="무슨 일이 있었나">
      <div className="headerline">
        <h2>무슨 일이 있었나</h2>
        <span className="small">
          {time(start, report.meta.timezone)}–{time(end, report.meta.timezone)}{" "}
          · {report.meta.timezone}
        </span>
      </div>
      <p className="phenomenon">{report.summary.impact}</p>
      <p className="small">회복 기록: {report.summary.recovery}</p>
      <div className="legend">
        {metrics.map((m, i) => (
          <span key={m.id}>
            <i
              style={{
                borderColor: m.color,
                borderTopStyle:
                  i % 3 === 0 ? "solid" : i % 3 === 1 ? "dashed" : "dotted",
              }}
            />
            {m.label} · {m.unit}{" "}
            {m.actualMin === null
              ? "표본 없음"
              : `${m.actualMin.toLocaleString()}–${m.actualMax.toLocaleString()}`}
          </span>
        ))}
      </div>
      <p className="small">
        높이는 지표별 관측 범위(0 포함)를 0–100%로 표시합니다. 서로 다른 지표의
        크기 비교가 아닙니다. 실제 값·단위·설명은 마우스·터치·슬라이더로
        확인합니다.
      </p>
      <div className="chartwrap" ref={ref}>
        <svg
          className="timeline"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="같은 시간축에 겹친 장애 지표"
        >
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line
                x1={left}
                x2={width - right}
                y1={bottom - ((bottom - top) * v) / 100}
                y2={bottom - ((bottom - top) * v) / 100}
                stroke="var(--border)"
              />
              <text
                x={left - 7}
                y={bottom - ((bottom - top) * v) / 100 + 4}
                textAnchor="end"
              >
                {v}%
              </text>
            </g>
          ))}
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const t = start + ((end - start) * i) / ticks;
            return (
              <g key={i}>
                <line
                  x1={x(t)}
                  x2={x(t)}
                  y1={top}
                  y2={bottom}
                  stroke="var(--border)"
                />
                <text x={x(t)} y={bottom + 24} textAnchor="middle">
                  {time(t, report.meta.timezone).slice(0, 5)}
                </text>
              </g>
            );
          })}
          <text x={left} y={height - 4}>
            지표별 상대 높이 (%)
          </text>
          {report.events.map((e, i) => (
            <g key={e.id}>
              <line
                x1={x(Date.parse(e.at))}
                x2={x(Date.parse(e.at))}
                y1={top}
                y2={bottom}
                stroke="var(--border)"
                strokeDasharray="2 3"
              />
              <text
                x={x(Date.parse(e.at))}
                y={i % 2 ? 33 : 20}
                textAnchor="middle"
              >
                {i + 1}
              </text>
            </g>
          ))}
          {metrics.map((m, i) => (
            <path
              key={m.id}
              data-series={m.id}
              d={path(m)}
              fill="none"
              stroke={m.color}
              strokeWidth="2"
              strokeDasharray={
                i % 3 === 1 ? "6 4" : i % 3 === 2 ? "2 4" : undefined
              }
            />
          ))}
          <line
            data-cursor={active}
            x1={x(active)}
            x2={x(active)}
            y1={top}
            y2={bottom}
            stroke="var(--accent)"
          />
          <rect
            data-chart-hit="true"
            x={left}
            y={top}
            width={width - left - right}
            height={bottom - top}
            fill="transparent"
            onPointerMove={(e) => {
              if (!pinned) setHover(pointer(e));
            }}
            onPointerLeave={() => {
              if (!pinned) setHover(null);
            }}
            onPointerDown={(e) => {
              const t = pointer(e);
              if (
                pinned &&
                hover !== null &&
                Math.abs(t - hover) < (end - start) / 100
              ) {
                setPinned(false);
                setHover(null);
              } else {
                setHover(t);
                setPinned(true);
              }
            }}
          />
        </svg>
        {hover !== null && (
          <div className="charttip" role="tooltip">
            <button
              className="charttip-close"
              onClick={() => {
                setHover(null);
                setPinned(false);
              }}
            >
              탐색 정보 닫기
            </button>
            <strong>
              {time(hover, report.meta.timezone)} ·{" "}
              {pinned ? "고정 · Esc로 닫기" : "가까운 원본 표본"}
            </strong>
            {metrics.map((m) => {
              const p = sampleAt(m, hover);
              return (
                <div data-metric={m.id} key={m.id}>
                  <strong style={{ color: m.color }}>
                    {m.label}: {valuesText(m, hover)}
                  </strong>
                  <div className="small">
                    표본 시각 {p ? time(p[0], report.meta.timezone) : "없음"} ·{" "}
                    {m.description || m.aggregation}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <details className="timeline-tools no-print">
        <summary>키보드 시각 탐색 · 조작 방법</summary>
        <label className="timecontrol">
          시각 탐색{" "}
          <input
            aria-label="모든 지표의 시각 탐색"
            type="range"
            min="0"
            max="1000"
            value={Math.round(((active - start) / (end - start)) * 1000)}
            onChange={(e) => {
              const t = start + ((end - start) * Number(e.target.value)) / 1000;
              setHover(t);
              setPinned(true);
              setAt(t);
            }}
          />
          <span className="small">{time(active, report.meta.timezone)}</span>
        </label>
        <p className="small">
          마우스 이동: 수치 확인 · 클릭/터치: 고정 · Esc: 닫기. 원본 표본 시각을
          표시하며 보간하지 않습니다. 공백은 관측 누락입니다.
        </p>
      </details>
      <div className="events">
        {report.events.map((e, i) => (
          <button
            key={e.id}
            data-event={e.id}
            aria-pressed={selected === e.id}
            onClick={() => choose(e)}
          >
            {i + 1} · {time(e.at, report.meta.timezone).slice(0, 5)} {e.label}
          </button>
        ))}
      </div>
      {event ? (
        <div className="selected">
          <strong>
            선택한 사건 · {time(event.at, report.meta.timezone)} · {event.label}
          </strong>
          <p>{event.detail}</p>
          <div className="values">
            {metrics.map((m) => (
              <span key={m.id}>
                {m.label}: {valuesText(m, Date.parse(event.at))}
              </span>
            ))}
          </div>
          <button
            className="textbutton"
            onClick={() => onEvidence(event.evidence_ids)}
          >
            이 사건의 근거 확인 →
          </button>
        </div>
      ) : report.events.length === 0 ? (
        <p>사건 기록이 없습니다.</p>
      ) : null}
      <div className="print-events">
        <h3>전체 사건 시간표</h3>
        {report.events.map((e, index) => (
          <article key={e.id} data-print-event={e.id}>
            <strong>
              {index + 1}. {e.at} · {e.label}
            </strong>
            <p>{e.detail}</p>
            <p>근거: {e.evidence_ids.join(", ")}</p>
          </article>
        ))}
      </div>
      <p className="small">
        시간 정렬은 인과관계의 증명이 아닙니다. 아래에서 연결 근거와 미확인
        내용을 확인합니다.
      </p>
    </section>
  );
}
