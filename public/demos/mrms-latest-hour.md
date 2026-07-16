# NOAA MRMS precipitation — the latest hour

[NOAA MRMS CONUS analysis, hourly](https://source.coop/dynamical/noaa-mrms-conus-analysis-hourly)
is an hourly precipitation analysis over the continental US at ~1 km
resolution, from 2014 to the present hour, published on Source Cooperative as
cloud-optimized Zarr by [dynamical.org](https://dynamical.org/catalog/noaa-mrms-conus-analysis-hourly/).

This document streams **the latest hour of rainfall** straight from
`data.source.coop` into an in-browser Python kernel — no server, no download
step. Click **Activate**, then run the cells top to bottom (the region read in
step 4 fetches ~10 MB).

```{note}
In a regular Python environment you don't need any of the store plumbing
below — `xr.open_zarr("https://data.source.coop/dynamical/noaa-mrms-conus-analysis-hourly/v0.3.0.zarr")`
is all it takes. See the [dynamical.org docs](https://dynamical.org/catalog/noaa-mrms-conus-analysis-hourly/)
for examples. The custom store here exists only because the browser kernel
(Pyodide/WASM) has no threads or sockets for zarr's usual I/O machinery.
```

## 1. Install zarr

The dataset is Zarr v3 with sharding, which needs `zarr>=3`. Pyodide ships
compiled builds of the codecs it depends on (`numcodecs`, `crc32c`), so we
install those first and then `zarr` itself without dependency resolution.

```{code-cell} python
import micropip
from pyodide.http import pyfetch

await micropip.install(["numcodecs", "crc32c", "donfig", "typing-extensions"])

# zarr 3 pins numcodecs>=0.14, which has no Pyodide build — the bundled
# (compiled) 0.13 works fine — so zarr must install with deps=False. micropip
# 0.8 has a download race with deps=False on network wheels, so fetch the
# wheel ourselves and install it from the local filesystem.
# (Also: no `import zarr` in THIS cell — the kernel pre-scans cell source and
# would auto-install the old bundled zarr 2 before micropip runs.)
WHEEL = "https://files.pythonhosted.org/packages/45/57/3329346940f78de49047ddcb03fdbca9e16450c3a942688bf24201a322e5/zarr-3.0.10-py3-none-any.whl"
path = "/tmp/" + WHEEL.rsplit("/", 1)[1]
open(path, "wb").write(await (await pyfetch(WHEEL)).bytes())
await micropip.install("emfs:" + path, deps=False)

print("zarr installed")
```

## 2. A fetch-based zarr store

zarr's sync API needs an I/O thread and its fsspec store needs sockets —
neither exists in WebAssembly. Its *async* API only needs something that can
fetch bytes, so this minimal store maps zarr reads onto the browser's `fetch`.
HTTP Range requests let zarr pull individual ~MB chunks out of the dataset's
multi-gigabyte shard objects.

```{code-cell} python
import asyncio

import zarr
from pyodide.http import pyfetch
from zarr.abc.store import Store, RangeByteRequest, OffsetByteRequest, SuffixByteRequest

print("zarr", zarr.__version__)


class HTTPStore(Store):
    """Minimal read-only zarr v3 store over HTTP(S) using the browser's fetch."""

    supports_writes = False
    supports_deletes = False
    supports_partial_writes = False
    supports_listing = False

    def __init__(self, base_url):
        super().__init__(read_only=True)
        self.base = base_url.rstrip("/")
        self.nbytes = 0  # downloaded payload, for reporting
        self.nreq = 0

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
        self.nreq += 1
        self.nbytes += len(data)
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


print("HTTPStore defined")
```

## 3. Open the dataset

Consolidated metadata means opening the whole hierarchy costs a single
request. The coordinate arrays are small, so we read them eagerly — the last
`time` value is the latest available hour.

```{code-cell} python
import numpy as np
import pandas as pd
import zarr.api.asynchronous as azarr

URL = "https://data.source.coop/dynamical/noaa-mrms-conus-analysis-hourly/v0.3.0.zarr"

store = HTTPStore(URL)
root = await azarr.open_group(store=store, mode="r", use_consolidated=True)

times = pd.to_datetime(await (await root.getitem("time")).getitem(slice(None)), unit="s")
lats = await (await root.getitem("latitude")).getitem(slice(None))  # descending: north -> south
lons = await (await root.getitem("longitude")).getitem(slice(None))

print(f"{len(times):,} hourly steps, {times[0]} to {times[-1]} UTC")
print(f"grid: {len(lats)} x {len(lons)} at ~1 km")
```

## 4. Read the latest hour

Chunks span the full time axis, so reading all of CONUS for one hour would
touch every spatial chunk (gigabytes). A regional box keeps the download to a
few MB — move or widen it as you like.

```{code-cell} python
LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = 27.0, 33.0, -91.0, -81.0  # Gulf Coast / Southeast US

lat_ix = np.where((lats >= LAT_MIN) & (lats <= LAT_MAX))[0]
lon_ix = np.where((lons >= LON_MIN) & (lons <= LON_MAX))[0]
sel = (len(times) - 1, slice(lat_ix[0], lat_ix[-1] + 1), slice(lon_ix[0], lon_ix[-1] + 1))

precip = await root.getitem("precipitation_surface")
block = await precip.getitem(sel)  # kg m-2 s-1, equivalent to mm/s

import xarray as xr

rain = xr.DataArray(
    block * 3600.0,  # mm/s -> mm/h
    dims=("latitude", "longitude"),
    coords={"latitude": lats[sel[1]], "longitude": lons[sel[2]]},
    name="precipitation_rate",
    attrs={"units": "mm/h"},
)
print(f"latest hour: {times[-1]} UTC | grid {rain.shape}")
print(f"downloaded {store.nbytes / 1e6:.1f} MB in {store.nreq} requests")
print(f"raining on {float((rain > 0.1).mean()) * 100:.1f}% of the box, peak {float(rain.max()):.1f} mm/h")
```

## 5. Render it

A log color scale is standard for rainfall — most wet pixels drizzle, a few
pour. Gray is dry (or no radar coverage); overnight hours can be quiet.

```{code-cell} python
import matplotlib.pyplot as plt
from matplotlib.colors import LogNorm

fig, ax = plt.subplots(figsize=(9, 5.5))
ax.set_facecolor("#e8e8e8")  # dry areas
rain.where(rain >= 0.1).plot.imshow(
    ax=ax, cmap="turbo",
    norm=LogNorm(vmin=0.1, vmax=max(30.0, float(rain.max()))),
    cbar_kwargs={"label": "precipitation rate (mm/h)"},
)
ax.set_title(f"MRMS hourly precipitation — {times[-1]:%Y-%m-%d %H:%M} UTC")
ax.set_aspect("equal")
plt.show()
```

---

Data: NOAA NWS NCEP MRMS, processed into Zarr by
[dynamical.org](https://dynamical.org) — [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/),
hosted on [Source Cooperative](https://source.coop/dynamical/noaa-mrms-conus-analysis-hourly).
