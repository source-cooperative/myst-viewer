# NOAA MRMS CONUS analysis, hourly

The NOAA Multi-Radar/Multi-Sensor System (MRMS) integrates data from multiple
radars and radar networks, surface observations, numerical weather prediction
models, and climatology to generate seamless, high-resolution mosaics of
precipitation and severe weather over the contiguous United States.

This dataset is an archive of MRMS hourly precipitation analyses, processed
into cloud-optimized Zarr by [dynamical.org](https://dynamical.org/catalog/noaa-mrms-conus-analysis-hourly/)
and hosted on [Source Cooperative](https://source.coop/dynamical/noaa-mrms-conus-analysis-hourly).
It updates continuously — the preview below reads the most recent hour
available.

| | |
|---|---|
| **Spatial domain** | Continental United States |
| **Spatial resolution** | 0.01 degrees (~1 km) |
| **Time domain** | 2014-11-01 00:00 UTC to present |
| **Time resolution** | 1 hour |
| **Format** | Zarr v3, sharded, consolidated metadata |
| **License** | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

## Live preview — rainfall over the last hour

The map below is not a static image. It is rendered **live in your browser**:
an in-browser Python kernel streams the latest hour of data straight from
`data.source.coop` (a few MB over HTTP range requests — no server, no
download step) and plots it. Expand the collapsed cell to see exactly how.
Overnight hours can be quiet — gray means dry or no radar coverage.

```{code-cell} python
:tags: [remove-input]
# Everything needed to draw the map lives in this one cell: install zarr 3,
# define a fetch-based store (WebAssembly has no threads or sockets for
# zarr's usual I/O), read the latest hour, and plot it. In a regular Python
# environment all of this is one line — see "Using this dataset" below.
import asyncio
import importlib
import logging

import micropip
from pyodide.http import pyfetch

logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)  # keep the font-cache notice out of the output

# zarr 3 pins numcodecs>=0.14, which has no Pyodide build — the bundled
# (compiled) 0.13 works fine — so zarr must install with deps=False. micropip
# 0.8 has a download race with deps=False on network wheels, so fetch the
# wheel ourselves and install it from the local filesystem.
await micropip.install(["numcodecs", "crc32c", "donfig", "typing-extensions"])
WHEEL = "https://files.pythonhosted.org/packages/45/57/3329346940f78de49047ddcb03fdbca9e16450c3a942688bf24201a322e5/zarr-3.0.10-py3-none-any.whl"
path = "/tmp/" + WHEEL.rsplit("/", 1)[1]
open(path, "wb").write(await (await pyfetch(WHEEL)).bytes())
await micropip.install("emfs:" + path, deps=False)

# zarr is imported dynamically: the kernel pre-scans this cell's source for
# import statements, and a literal `import zarr` here would auto-load the old
# bundled zarr 2 before micropip installs zarr 3 above.
_abc = importlib.import_module("zarr.abc.store")
Store = _abc.Store
RangeByteRequest = _abc.RangeByteRequest
OffsetByteRequest = _abc.OffsetByteRequest
SuffixByteRequest = _abc.SuffixByteRequest
azarr = importlib.import_module("zarr.api.asynchronous")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import xarray as xr
from matplotlib.colors import LogNorm


class HTTPStore(Store):
    """Minimal read-only zarr v3 store over HTTP(S) using the browser's fetch."""

    supports_writes = False
    supports_deletes = False
    supports_partial_writes = False
    supports_listing = False

    def __init__(self, base_url):
        super().__init__(read_only=True)
        self.base = base_url.rstrip("/")

    def __eq__(self, other):
        return isinstance(other, HTTPStore) and other.base == self.base

    async def get(self, key, prototype, byte_range=None):
        headers = {}
        if isinstance(byte_range, RangeByteRequest):
            headers["Range"] = f"bytes={byte_range.start}-{byte_range.end - 1}"
        elif isinstance(byte_range, OffsetByteRequest):
            headers["Range"] = f"bytes={byte_range.offset}-"
        elif isinstance(byte_range, SuffixByteRequest):
            headers["Range"] = f"bytes=-{byte_range.suffix}"
        resp = await pyfetch(f"{self.base}/{key}", headers=headers)
        if resp.status in (403, 404):
            return None  # zarr probes for optional keys; missing is normal
        data = await resp.bytes()
        return prototype.buffer.from_bytes(data)

    async def get_partial_values(self, prototype, key_ranges):
        return await asyncio.gather(*(self.get(k, prototype, r) for k, r in key_ranges))

    async def exists(self, key):
        return (await pyfetch(f"{self.base}/{key}", method="HEAD")).status == 200

    # read-only: writing, deleting and listing are never called
    async def set(self, key, value): raise NotImplementedError
    async def delete(self, key): raise NotImplementedError
    async def set_partial_values(self, key_start_values): raise NotImplementedError
    def list(self): raise NotImplementedError
    def list_prefix(self, prefix): raise NotImplementedError
    def list_dir(self, prefix): raise NotImplementedError


# Open the dataset (one request, thanks to consolidated metadata) and read
# the latest hour over a Gulf Coast / Southeast US box. Chunks span the full
# time axis, so a regional box keeps the download to a few MB.
URL = "https://data.source.coop/dynamical/noaa-mrms-conus-analysis-hourly/v0.3.0.zarr"

store = HTTPStore(URL)
root = await azarr.open_group(store=store, mode="r", use_consolidated=True)

times = pd.to_datetime(await (await root.getitem("time")).getitem(slice(None)), unit="s")
lats = await (await root.getitem("latitude")).getitem(slice(None))  # descending: north -> south
lons = await (await root.getitem("longitude")).getitem(slice(None))

LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = 27.0, 33.0, -91.0, -81.0

lat_ix = np.where((lats >= LAT_MIN) & (lats <= LAT_MAX))[0]
lon_ix = np.where((lons >= LON_MIN) & (lons <= LON_MAX))[0]
sel = (len(times) - 1, slice(lat_ix[0], lat_ix[-1] + 1), slice(lon_ix[0], lon_ix[-1] + 1))

precip = await root.getitem("precipitation_surface")
block = await precip.getitem(sel)  # kg m-2 s-1, equivalent to mm/s

rain = xr.DataArray(
    block * 3600.0,  # mm/s -> mm/h
    dims=("latitude", "longitude"),
    coords={"latitude": lats[sel[1]], "longitude": lons[sel[2]]},
    name="precipitation_rate",
    attrs={"units": "mm/h"},
)

fig, ax = plt.subplots(figsize=(9, 5.5))
ax.set_facecolor("#e8e8e8")  # dry areas
rain.where(rain >= 0.1).plot.imshow(
    ax=ax, cmap="turbo",
    norm=LogNorm(vmin=0.1, vmax=max(30.0, float(rain.max()))),
    cbar_kwargs={"label": "precipitation rate (mm/h)"},
)
ax.set_title(f"MRMS hourly precipitation, Gulf Coast — {times[-1]:%Y-%m-%d %H:%M} UTC")
ax.set_aspect("equal")
plt.show()
```

## Using this dataset

In a regular Python environment, one line opens the whole 11-year archive —
xarray and zarr stream only the chunks you touch:

```python
import xarray as xr

ds = xr.open_zarr("https://data.source.coop/dynamical/noaa-mrms-conus-analysis-hourly/v0.3.0.zarr")
ds["precipitation_surface"].sel(time="2026-01-01T00", latitude=40, longitude=-90, method="nearest").compute()
```

See the [dynamical.org catalog page](https://dynamical.org/catalog/noaa-mrms-conus-analysis-hourly/)
for quickstart notebooks and the full variable reference.

## Variables

All variables share dimensions `time × latitude × longitude`.

| variable | description | units |
|---|---|---|
| `precipitation_surface` | Average precipitation rate over the previous hour (multi-sensor, gauge-corrected) | kg m⁻² s⁻¹ (≡ mm/s) |
| `precipitation_radar_only_surface` | Radar-only precipitation rate, no gauge correction | kg m⁻² s⁻¹ |
| `precipitation_pass_1_surface` | Multi-sensor pass 1 (lower latency, fewer gauges; Oct 2020+) | kg m⁻² s⁻¹ |
| `precipitation_pass_2_surface` | Multi-sensor pass 2 (higher latency, more gauges; Oct 2020+) | kg m⁻² s⁻¹ |
| `categorical_precipitation_type_surface` | Surface precipitation type flag (rain / snow / hail / …) | 1 |
| `flash_qpe_ffg_max_surface` | Max QPE-to-flash-flood-guidance percentage (Oct 2020+) | percent |

## License and attribution

Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Cite as: *NOAA NWS NCEP MRMS data processed by
[dynamical.org](https://dynamical.org) from NOAA NCEP, NOAA Open Data
Dissemination and Iowa Mesonet archives*, hosted on
[Source Cooperative](https://source.coop/dynamical/noaa-mrms-conus-analysis-hourly).
