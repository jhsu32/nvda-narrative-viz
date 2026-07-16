# One Chart, Retold

Narrative visualization of NVIDIA's quarterly revenue, fiscal years 2019 to 2026.
Built with D3 v7 and d3-annotation.

Martini glass structure: three guided scenes (total revenue as a line chart,
then the same revenue stacked by segment), followed by an open exploration
stage with tooltips and segment filters.

## Running locally

The data is loaded with `d3.csv()`, which doesn't work over `file://`, so the
folder has to be served:

```
python3 -m http.server 8000
```

then open http://localhost:8000.

## Files

- `index.html` - page skeleton, loads d3 and d3-annotation from a CDN
- `style.css` - styles
- `script.js` - scene definitions, chart drawing, annotations, event handlers
- `data.csv` - quarterly revenue by segment in $M

## Data

Revenue figures were entered by hand from the quarterly results posted on
NVIDIA's investor relations site:
https://investor.nvidia.com/financial-info/quarterly-results/default.aspx

All numbers are GAAP revenue in millions of USD, by reported segment.
NVIDIA's fiscal year ends in late January, so for example FY2026 Q4 is the
quarter ending 2026-01-25. The "everything else" column is Professional
Visualization + Automotive + OEM & Other, computed as:

    other = total - datacenter - gaming
