import { useEffect } from "react";
import { Theme, Flex, Heading, Text, Code, Link } from "@radix-ui/themes";

// Bundled demos served from public/demos/ at the Vite base path.
const DEMOS: { file: string; label: string; run?: boolean }[] = [
  { file: "numpy-matplotlib.md", label: "NumPy + Matplotlib (MyST .md)" },
  { file: "pandas-explore.ipynb", label: "pandas DataFrames (.ipynb)" },
  { file: "xarray-dataset.ipynb", label: "xarray Dataset (.ipynb, %pip install)" },
  { file: "pep723.md", label: "PEP 723 inline dependencies (MyST .md)" },
  { file: "mrms-latest-hour.md", label: "NOAA MRMS latest-hour rainfall from source.coop (MyST .md, zarr)" },
  { file: "mrms-latest-hour.ipynb", label: "NOAA MRMS latest-hour rainfall from source.coop (.ipynb, zarr)" },
  // run: true auto-runs on open — README-style pages where only the result matters.
  { file: "mrms-readme.md", label: "NOAA MRMS product README — live map, code hidden, auto-runs (MyST .md)", run: true },
  { file: "mrms-readme.ipynb", label: "NOAA MRMS product README — live map, code hidden, auto-runs (.ipynb)", run: true },
];

/**
 * Landing page shown when the viewer is opened without a `?url=`. Links to the
 * bundled demos, each as a `?url=` back into the viewer (carrying the theme).
 */
export function Home({ theme }: { theme: "light" | "dark" }) {
  // Mirror the theme onto <html> so the global `.dark` hook reacts, same as Article.
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("dark", theme === "dark");
    return () => el.classList.remove("dark");
  }, [theme]);

  const demoHref = (file: string, run?: boolean) =>
    `?url=${encodeURIComponent(
      location.origin + import.meta.env.BASE_URL + "demos/" + file,
    )}&theme=${theme}${run ? "&run=true" : ""}`;

  return (
    <Theme
      accentColor="gray"
      grayColor="gray"
      radius="none"
      scaling="110%"
      appearance={theme}
    >
      <Flex direction="column" gap="3" p="5" style={{ maxWidth: 640 }}>
        <Heading size="6">MyST + JupyterLite viewer</Heading>
        <Text>
          Pass <Code>?url=</Code> with a MyST <Code>.md</Code> or Jupyter{" "}
          <Code>.ipynb</Code> URL to view any document. The demos below run live
          in your browser after you click Activate.
        </Text>
        <ul>
          {DEMOS.map((d) => (
            <li key={d.file}>
              <Link href={demoHref(d.file, d.run)}>{d.label}</Link>
            </li>
          ))}
        </ul>
      </Flex>
    </Theme>
  );
}
