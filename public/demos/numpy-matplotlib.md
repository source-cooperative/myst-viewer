# NumPy & Matplotlib

This is a **MyST Markdown** document with executable `{code-cell}` blocks. It
renders statically by default; click **Activate** to boot an in-browser Python
(JupyterLite/Pyodide) kernel, then run the cells below.

`numpy` and `matplotlib` ship with Pyodide, so no installation is needed.

## Array statistics

```{code-cell} python
import numpy as np

x = np.linspace(0, 2 * np.pi, 200)
y = np.sin(x)
print("samples:", x.size)
print("mean:", round(float(y.mean()), 4))
print("std:", round(float(y.std()), 4))
```

## A quick plot

```{code-cell} python
import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 2 * np.pi, 200)
fig, ax = plt.subplots(figsize=(6, 3))
ax.plot(x, np.sin(x), label="sin")
ax.plot(x, np.cos(x), label="cos")
ax.set_title("Trigonometric functions")
ax.legend()
plt.show()
```

## NumPy linear algebra

```{code-cell} python
import numpy as np

A = np.array([[2.0, 1.0], [1.0, 3.0]])
eigvals, eigvecs = np.linalg.eig(A)
print("eigenvalues:", np.round(eigvals, 3))
print("eigenvectors:\n", np.round(eigvecs, 3))
```
