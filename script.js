// NVIDIA quarterly revenue narrative visualization.
// Scenes 0-2 walk through the story, scene 3 lets the user explore.

const state = {
  scene: 0,
  visibleSegments: { datacenter: true, gaming: true, other: true },
};

// chart geometry
const MARGIN = { top: 70, right: 30, bottom: 40, left: 56 };
const WIDTH = 900;
const HEIGHT = 480;
const INNER_W = WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;
const T = 900; // transition duration (ms)

const SEGMENTS = [
  { key: "datacenter", label: "Data Center", color: "#76b900" },
  { key: "gaming", label: "Gaming", color: "#3d3d3d" },
  { key: "other", label: "Everything else", color: "#c9c9c9" },
];

const fmtUSD = (m) =>
  m >= 1000 ? `$${(m / 1000).toFixed(m >= 10000 ? 0 : 1)}B` : `$${m}M`;
const parseDate = d3.timeParse("%Y-%m-%d");

// each scene = header text + a date window + a draw function
const SCENES = [
  {
    eyebrow: "Part 1 of 4",
    title: "A gaming company",
    lede:
      "Before the recent AI boom, NVIDIA's revenue rose and fell with the graphics card cycle: " +
      "up when gamers (and crypto miners) were buying GPUs, down when demand weakened.",
    end: "2023-01-29",
    draw: drawLineScene,
    nextLabel: "Next →",
  },
  {
    eyebrow: "Part 2 of 4",
    title: "The inflection",
    lede:
      "ChatGPT launched in late 2022, and demand for NVIDIA's data center GPUs took off as " +
      "cloud providers built out AI infrastructure. After the May 2023 guidance came in far " +
      "above expectations, Data Center replaced Gaming as the main driver of NVIDIA's growth.",
    end: "2026-01-25",
    draw: drawLineScene,
    nextLabel: "Next →",
  },
  {
    eyebrow: "Part 3 of 4",
    title: "A data center company",
    lede:
      "Splitting the same revenue by segment shows what changed: the green Data Center layer " +
      "takes over the chart. Gaming still grows, it just no longer defines the company.",
    end: "2026-01-25",
    draw: drawStackScene,
    nextLabel: "Explore the data →",
  },
  {
    eyebrow: "Part 4 of 4 · explore",
    title: "Dig into the numbers",
    lede:
      "Hover over the chart to see exact revenue for each quarter, and use the checkboxes " +
      "to show or hide segments. Try viewing Gaming alone: it is still a cyclical business " +
      "underneath.",
    end: "2026-01-25",
    draw: drawExploreScene,
    nextLabel: null,
  },
];

const svg = d3
  .select("#chart")
  .append("svg")
  .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);

const g = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

const gGrid = g.append("g").attr("class", "grid");
const gAreas = g.append("g").attr("class", "areas");
const gLine = g.append("g").attr("class", "line-layer");
const gAxisX = g.append("g").attr("class", "axis axis-x").attr("transform", `translate(0,${INNER_H})`);
const gAxisY = g.append("g").attr("class", "axis axis-y");
const gEvents = g.append("g").attr("class", "events");
const gAnnot = g.append("g").attr("class", "annotation-group");
const gHover = g.append("g").attr("class", "hover-layer");

const x = d3.scaleTime().range([0, INNER_W]);
const y = d3.scaleLinear().range([INNER_H, 0]).nice();

let DATA = [];
let byTime = new Map(); // date(ms) -> row, used to anchor annotations

function sceneData() {
  const end = parseDate(SCENES[state.scene].end);
  return DATA.filter((d) => d.date <= end);
}

function updateScales(rows, yMax) {
  x.domain(d3.extent(rows, (d) => d.date));
  y.domain([0, yMax * 1.06]);
}

function drawAxes() {
  gAxisX.transition().duration(T).call(
    d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%b %Y")).tickSizeOuter(0)
  );
  gAxisY.transition().duration(T).call(
    d3.axisLeft(y).ticks(6).tickFormat(fmtUSD).tickSizeOuter(0)
  );
  const ticks = y.ticks(6);
  gGrid
    .selectAll("line")
    .data(ticks, (d) => d)
    .join(
      (enter) => enter.append("line").attr("class", "gridline").attr("x1", 0).attr("x2", INNER_W),
      (update) => update,
      (exit) => exit.transition().duration(T / 2).style("opacity", 0).remove()
    )
    .transition()
    .duration(T)
    .attr("x2", INNER_W)
    .attr("y1", (d) => y(d))
    .attr("y2", (d) => y(d))
    .style("opacity", 1);
}

function clearAnnotations() {
  gAnnot.selectAll("*").remove();
  gEvents.selectAll("*").remove();
}

// all scenes share the same annotation style (callout elbow anchored to a data point)
function addAnnotations(list) {
  const makeAnnotations = d3
    .annotation()
    .type(d3.annotationCalloutElbow)
    .notePadding(6)
    .annotations(
      list.map((a) => ({
        note: { title: a.title, label: a.label, wrap: a.wrap || 170, align: "left" },
        x: a.x,
        y: a.y,
        dx: a.dx,
        dy: a.dy,
      }))
    );
  gAnnot.call(makeAnnotations);
  // fade in after the chart transition settles
  gAnnot.style("opacity", 0).transition().delay(T * 0.7).duration(400).style("opacity", 1);
}

function addEventLine(dateStr, label) {
  const xe = x(parseDate(dateStr));
  gEvents
    .append("line")
    .attr("class", "event-line")
    .attr("x1", xe).attr("x2", xe)
    .attr("y1", 0).attr("y2", INNER_H)
    .style("opacity", 0)
    .transition().delay(T * 0.7).duration(400).style("opacity", 1);
  gEvents
    .append("text")
    .attr("class", "event-label")
    .attr("x", xe).attr("y", -10)
    .attr("text-anchor", "middle")
    .text(label)
    .style("opacity", 0)
    .transition().delay(T * 0.7).duration(400).style("opacity", 1);
}

const rowAt = (dateStr) => byTime.get(+parseDate(dateStr));

// scenes 0 and 1: total revenue line
function drawLineScene() {
  const rows = sceneData();
  updateScales(rows, d3.max(rows, (d) => d.total));
  drawAxes();

  // remove stacked areas if returning from scene 2/3
  gAreas.selectAll("path").transition().duration(T / 2).style("opacity", 0).remove();
  hideLegend();

  const line = d3.line().x((d) => x(d.date)).y((d) => y(d.total));

  gLine
    .selectAll("path.total")
    .data([rows])
    .join(
      (enter) =>
        enter
          .append("path")
          .attr("class", "total")
          .attr("fill", "none")
          .attr("stroke", "#222")
          .attr("stroke-width", 2)
          .attr("d", line)
          .style("opacity", 0)
          .call((s) => s.transition().duration(T).style("opacity", 1)),
      (update) => update.transition().duration(T).attr("d", line).style("opacity", 1)
    );

  gLine
    .selectAll("circle.q")
    .data(rows, (d) => +d.date)
    .join(
      (enter) =>
        enter
          .append("circle")
          .attr("class", "q")
          .attr("r", 2.4)
          .attr("fill", "#222")
          .attr("cx", (d) => x(d.date))
          .attr("cy", (d) => y(d.total))
          .style("opacity", 0)
          .call((s) => s.transition().delay(T * 0.5).duration(400).style("opacity", 1)),
      (update) =>
        update.transition().duration(T).attr("cx", (d) => x(d.date)).attr("cy", (d) => y(d.total)).style("opacity", 1),
      (exit) => exit.transition().duration(T / 2).style("opacity", 0).remove()
    );

  if (state.scene === 0) {
    const crash = rowAt("2019-01-27");
    const peak = rowAt("2022-01-30");
    const bust = rowAt("2022-10-30");
    addAnnotations([
      {
        title: "The crypto hangover",
        label: "Q4 FY19: revenue drops 24% YoY as mining demand for GPUs collapses.",
        x: x(crash.date), y: y(crash.total), dx: 40, dy: -60,
      },
      {
        title: "Pandemic PC boom",
        label: "Total revenue peaks at $7.6B, with Gaming still the largest segment.",
        x: x(peak.date), y: y(peak.total), dx: -80, dy: -40,
      },
      {
        title: "The second bust",
        label: "Q3 FY23: gaming revenue halves as pandemic demand unwinds. The cycle looks intact.",
        x: x(bust.date), y: y(bust.total), dx: -210, dy: 90, wrap: 190,
      },
    ]);
  } else if (state.scene === 1) {
    const shock = rowAt("2023-07-30");
    const latest = rowAt("2026-01-25");
    addEventLine("2022-11-30", "ChatGPT launches");
    addAnnotations([
      {
        title: "The guidance shock",
        label:
          "May 2023: NVIDIA guides the July quarter roughly 50% above analyst estimates. Revenue nearly doubles in one quarter.",
        x: x(shock.date), y: y(shock.total), dx: -60, dy: -110, wrap: 200,
      },
      {
        title: "$68.1B a quarter",
        label: "Q4 FY26: about 9x the pre-AI peak, three years after ChatGPT launched.",
        x: x(latest.date), y: y(latest.total), dx: -190, dy: 35, wrap: 180,
      },
    ]);
  }
}

// scenes 2 and 3: stacked by segment
function stackedSeries(rows) {
  const keys = SEGMENTS.map((s) => s.key).filter((k) => state.visibleSegments[k]);
  return { series: d3.stack().keys(keys)(rows), keys };
}

function drawStack(rows) {
  const { series } = stackedSeries(rows);
  const yMax = d3.max(series, (s) => d3.max(s, (d) => d[1])) || 1;
  updateScales(rows, yMax);
  drawAxes();

  // remove the total line when entering stacked scenes
  gLine.selectAll("*").transition().duration(T / 2).style("opacity", 0).remove();

  const area = d3
    .area()
    .x((d) => x(d.data.date))
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]));

  const color = new Map(SEGMENTS.map((s) => [s.key, s.color]));

  gAreas
    .selectAll("path.seg")
    .data(series, (s) => s.key)
    .join(
      (enter) =>
        enter
          .append("path")
          .attr("class", "seg")
          .attr("fill", (s) => color.get(s.key))
          .attr("d", area)
          .style("opacity", 0)
          .call((sel) => sel.transition().duration(T).style("opacity", 0.92)),
      (update) => update.transition().duration(T).attr("d", area).style("opacity", 0.92),
      (exit) => exit.transition().duration(T / 2).style("opacity", 0).remove()
    );

  showLegend();
}

function drawStackScene() {
  state.visibleSegments = { datacenter: true, gaming: true, other: true }; // no filtering in the guided scene
  drawStack(sceneData());

  const overtake = rowAt("2022-05-01");
  const latest = rowAt("2026-01-25");
  addAnnotations([
    {
      title: "Data Center overtakes Gaming",
      label: "Q1 FY23: the first quarter where Data Center stays the bigger segment for good.",
      x: x(overtake.date), y: y(overtake.datacenter), dx: -40, dy: -140, wrap: 180,
    },
    {
      title: "91% of revenue",
      label: "Q4 FY26: Data Center brings in $62.3B of NVIDIA's $68.1B quarter.",
      x: x(latest.date), y: y(latest.datacenter / 2), dx: -180, dy: -20, wrap: 170,
    },
  ]);
}

// scene 3: free-form exploration
function drawExploreScene() {
  drawStack(sceneData());
  buildHoverLayer(sceneData());
}

function buildHoverLayer(rows) {
  gHover.selectAll("*").remove();
  const tooltip = d3.select("#tooltip");
  const bisect = d3.bisector((d) => d.date).center;

  const guide = gHover
    .append("line")
    .attr("class", "event-line")
    .attr("y1", 0)
    .attr("y2", INNER_H)
    .style("opacity", 0);

  gHover
    .append("rect")
    .attr("width", INNER_W)
    .attr("height", INNER_H)
    .attr("fill", "transparent")
    .on("pointermove", (event) => {
      const [mx] = d3.pointer(event);
      const row = rows[bisect(rows, x.invert(mx))];
      if (!row) return;
      guide.attr("x1", x(row.date)).attr("x2", x(row.date)).style("opacity", 1);

      const visible = SEGMENTS.filter((s) => state.visibleSegments[s.key]);
      const shown = visible.reduce((sum, s) => sum + row[s.key], 0);
      tooltip
        .html(
          `<span class="tt-quarter">${row.quarter}</span>` +
            visible
              .map(
                (s) =>
                  `<div class="tt-row"><span>${s.label}</span><span class="tt-num">${fmtUSD(row[s.key])}</span></div>`
              )
              .join("") +
            `<div class="tt-row" style="margin-top:4px;border-top:1px solid #ddd;padding-top:4px">` +
            `<span>Total shown</span><span class="tt-num">${fmtUSD(shown)}</span></div>`
        )
        .style("left", `${Math.min(event.clientX + 14, window.innerWidth - 260)}px`)
        .style("top", `${event.clientY + 14}px`)
        .attr("hidden", null);
    })
    .on("pointerleave", () => {
      tooltip.attr("hidden", true);
      guide.style("opacity", 0);
    });
}

function showLegend() {
  const el = d3.select("#legend").attr("hidden", null);
  el.selectAll("span.item")
    .data(SEGMENTS)
    .join("span")
    .attr("class", "item")
    .html((s) => `<span class="swatch" style="background:${s.color}"></span>${s.label}`);
}
function hideLegend() {
  d3.select("#legend").attr("hidden", true);
}

function render() {
  const scene = SCENES[state.scene];

  d3.select("#scene-eyebrow").text(scene.eyebrow);
  d3.select("#scene-title").text(scene.title);
  d3.select("#scene-lede").text(scene.lede);

  // exploration controls only exist in the last scene
  d3.select("#controls").attr("hidden", state.scene === 3 ? null : true);
  d3.select("#tooltip").attr("hidden", true);
  gHover.selectAll("*").remove();

  d3.select("#btn-back").attr("disabled", state.scene === 0 ? true : null);
  d3.select("#btn-next")
    .attr("disabled", scene.nextLabel ? null : true)
    .html(scene.nextLabel || "The end");

  d3.select("#progress").text(`${state.scene + 1} / ${SCENES.length}`);

  clearAnnotations();
  scene.draw();

  // keep the checkboxes in sync with state (scene 2 resets all segments to visible)
  d3.selectAll("#controls input").property("checked", function () {
    return state.visibleSegments[this.dataset.seg];
  });
}

// event handlers: update state, then re-render
d3.select("#btn-next").on("click", () => {
  if (state.scene < SCENES.length - 1) {
    state.scene += 1;
    render();
  }
});

d3.select("#btn-back").on("click", () => {
  if (state.scene > 0) {
    state.scene -= 1;
    render();
  }
});

// arrow keys mirror the buttons
d3.select("body").on("keydown", (event) => {
  if (event.key === "ArrowRight" && state.scene < SCENES.length - 1) {
    state.scene += 1;
    render();
  } else if (event.key === "ArrowLeft" && state.scene > 0) {
    state.scene -= 1;
    render();
  }
});

d3.selectAll("#controls input").on("change", function () {
  state.visibleSegments[this.dataset.seg] = this.checked;
  // don't allow hiding every segment at once
  if (!Object.values(state.visibleSegments).some(Boolean)) {
    state.visibleSegments[this.dataset.seg] = true;
    this.checked = true;
    return;
  }
  render();
});

d3.csv("data.csv", (d) => ({
  quarter: d.quarter,
  date: parseDate(d.date),
  datacenter: +d.datacenter,
  gaming: +d.gaming,
  other: +d.other,
  total: +d.total,
})).then((rows) => {
  DATA = rows.sort((a, b) => a.date - b.date);
  byTime = new Map(DATA.map((d) => [+d.date, d]));
  render();
});
