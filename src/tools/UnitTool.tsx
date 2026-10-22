import { useState } from "react";
import type { Copy } from "./shared";

/** A unit: `factor` of the category's base unit, or its own to/from functions (temperature, fuel). */
interface Unit {
  name: string;
  symbol: string;
  factor?: number;
  toBase?(v: number): number;
  fromBase?(v: number): number;
}

const u = (name: string, symbol: string, factor: number): Unit => ({ name, symbol, factor });

/** Base units: metre, square metre, litre, kilogram, °C, m/s, second, byte, pascal, joule, watt, degree, hertz, km/L, bit/s, newton, N·m. */
const CATEGORIES: { name: string; units: Unit[] }[] = [
  {
    name: "Length",
    units: [
      u("Millimetre", "mm", 0.001), u("Centimetre", "cm", 0.01), u("Metre", "m", 1), u("Kilometre", "km", 1000),
      u("Inch", "in", 0.0254), u("Foot", "ft", 0.3048), u("Yard", "yd", 0.9144), u("Mile", "mi", 1609.344),
      u("Nautical mile", "nmi", 1852), u("Micrometre", "µm", 1e-6), u("Nanometre", "nm", 1e-9),
    ],
  },
  {
    name: "Area",
    units: [
      u("Square millimetre", "mm²", 1e-6), u("Square centimetre", "cm²", 1e-4), u("Square metre", "m²", 1), u("Hectare", "ha", 1e4),
      u("Square kilometre", "km²", 1e6), u("Square inch", "in²", 0.00064516), u("Square foot", "ft²", 0.09290304),
      u("Square yard", "yd²", 0.83612736), u("Acre", "ac", 4046.8564224), u("Square mile", "mi²", 2589988.110336),
      u("Cent (India)", "cent", 40.468564224), u("Guntha (India)", "guntha", 101.17141056),
    ],
  },
  {
    name: "Volume",
    units: [
      u("Millilitre", "mL", 0.001), u("Litre", "L", 1), u("Cubic metre", "m³", 1000), u("Teaspoon (US)", "tsp", 0.00492892159375),
      u("Tablespoon (US)", "tbsp", 0.01478676478125), u("Fluid ounce (US)", "fl oz", 0.0295735295625), u("Cup (US)", "cup", 0.2365882365),
      u("Pint (US)", "pt", 0.473176473), u("Quart (US)", "qt", 0.946352946), u("Gallon (US)", "gal", 3.785411784),
      u("Pint (UK)", "pt UK", 0.56826125), u("Gallon (UK)", "gal UK", 4.54609), u("Cubic inch", "in³", 0.016387064), u("Cubic foot", "ft³", 28.316846592),
    ],
  },
  {
    name: "Weight",
    units: [
      u("Milligram", "mg", 1e-6), u("Gram", "g", 0.001), u("Kilogram", "kg", 1), u("Tonne", "t", 1000),
      u("Ounce", "oz", 0.028349523125), u("Pound", "lb", 0.45359237), u("Stone", "st", 6.35029318),
      u("US ton", "ton US", 907.18474), u("UK ton", "ton UK", 1016.0469088), u("Carat", "ct", 0.0002), u("Tola", "tola", 0.0116638038),
    ],
  },
  {
    name: "Temperature",
    units: [
      { name: "Celsius", symbol: "°C", toBase: (v) => v, fromBase: (v) => v },
      { name: "Fahrenheit", symbol: "°F", toBase: (v) => ((v - 32) * 5) / 9, fromBase: (v) => (v * 9) / 5 + 32 },
      { name: "Kelvin", symbol: "K", toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
      { name: "Rankine", symbol: "°R", toBase: (v) => ((v - 491.67) * 5) / 9, fromBase: (v) => ((v + 273.15) * 9) / 5 },
    ],
  },
  {
    name: "Speed",
    units: [
      u("Metre per second", "m/s", 1), u("Kilometre per hour", "km/h", 1 / 3.6), u("Mile per hour", "mph", 0.44704),
      u("Foot per second", "ft/s", 0.3048), u("Knot", "kn", 1852 / 3600), u("Mach (sea level)", "Mach", 340.29),
    ],
  },
  {
    name: "Time",
    units: [
      u("Millisecond", "ms", 0.001), u("Second", "s", 1), u("Minute", "min", 60), u("Hour", "h", 3600), u("Day", "d", 86400),
      u("Week", "wk", 604800), u("Month (avg)", "mo", 2629746), u("Year (avg)", "yr", 31556952), u("Decade", "dec", 315569520),
    ],
  },
  {
    name: "Data",
    units: [
      u("Bit", "b", 0.125), u("Byte", "B", 1), u("Kilobyte", "KB", 1e3), u("Megabyte", "MB", 1e6), u("Gigabyte", "GB", 1e9), u("Terabyte", "TB", 1e12),
      u("Petabyte", "PB", 1e15), u("Kibibyte", "KiB", 1024), u("Mebibyte", "MiB", 1024 ** 2), u("Gibibyte", "GiB", 1024 ** 3), u("Tebibyte", "TiB", 1024 ** 4),
    ],
  },
  {
    name: "Data Speed",
    units: [
      u("Bit per second", "bps", 1), u("Kilobit per second", "kbps", 1e3), u("Megabit per second", "Mbps", 1e6), u("Gigabit per second", "Gbps", 1e9),
      u("Kilobyte per second", "KB/s", 8e3), u("Megabyte per second", "MB/s", 8e6), u("Gigabyte per second", "GB/s", 8e9),
    ],
  },
  {
    name: "Pressure",
    units: [
      u("Pascal", "Pa", 1), u("Kilopascal", "kPa", 1000), u("Bar", "bar", 1e5), u("Millibar", "mbar", 100), u("Atmosphere", "atm", 101325),
      u("Pound per square inch", "psi", 6894.757293168), u("mm of mercury", "mmHg", 133.322387415), u("Inch of mercury", "inHg", 3386.389),
    ],
  },
  {
    name: "Energy",
    units: [
      u("Joule", "J", 1), u("Kilojoule", "kJ", 1000), u("Calorie", "cal", 4.184), u("Kilocalorie", "kcal", 4184), u("Watt hour", "Wh", 3600),
      u("Kilowatt hour", "kWh", 3.6e6), u("Electronvolt", "eV", 1.602176634e-19), u("BTU", "BTU", 1055.05585262), u("Foot-pound", "ft·lb", 1.3558179483),
    ],
  },
  {
    name: "Power",
    units: [
      u("Watt", "W", 1), u("Kilowatt", "kW", 1000), u("Megawatt", "MW", 1e6), u("Horsepower (metric)", "PS", 735.49875),
      u("Horsepower (mechanical)", "hp", 745.69987158), u("BTU per hour", "BTU/h", 0.29307107), u("Ton of refrigeration", "TR", 3516.8528),
    ],
  },
  {
    name: "Force",
    units: [u("Newton", "N", 1), u("Kilonewton", "kN", 1000), u("Kilogram-force", "kgf", 9.80665), u("Pound-force", "lbf", 4.4482216152605), u("Dyne", "dyn", 1e-5)],
  },
  {
    name: "Torque",
    units: [u("Newton metre", "N·m", 1), u("Kilogram-force metre", "kgf·m", 9.80665), u("Pound-foot", "lb·ft", 1.3558179483), u("Pound-inch", "lb·in", 0.112984829)],
  },
  {
    name: "Angle",
    units: [u("Degree", "°", 1), u("Radian", "rad", 180 / Math.PI), u("Gradian", "gon", 0.9), u("Arcminute", "′", 1 / 60), u("Arcsecond", "″", 1 / 3600), u("Turn", "turn", 360)],
  },
  {
    name: "Frequency",
    units: [u("Hertz", "Hz", 1), u("Kilohertz", "kHz", 1e3), u("Megahertz", "MHz", 1e6), u("Gigahertz", "GHz", 1e9), u("Revolutions per minute", "rpm", 1 / 60)],
  },
  {
    name: "Fuel Economy",
    units: [
      u("Kilometre per litre", "km/L", 1),
      { name: "Litre per 100 km", symbol: "L/100km", toBase: (v) => 100 / v, fromBase: (v) => 100 / v },
      u("Mile per gallon (US)", "mpg US", 1.609344 / 3.785411784),
      u("Mile per gallon (UK)", "mpg UK", 1.609344 / 4.54609),
    ],
  },
  {
    name: "Typography",
    units: [u("Pixel (96 dpi)", "px", 1), u("Point", "pt", 96 / 72), u("Pica", "pc", 16), u("Em (16 px)", "em", 16), u("Inch", "in", 96), u("Millimetre", "mm", 96 / 25.4), u("Centimetre", "cm", 96 / 2.54)],
  },
];

const toBase = (unit: Unit, v: number) => (unit.toBase ? unit.toBase(v) : v * unit.factor!);
const fromBase = (unit: Unit, v: number) => (unit.fromBase ? unit.fromBase(v) : v / unit.factor!);

/** Up to 10 significant digits, without trailing zeros; tiny and huge numbers in e-notation. */
function format(v: number) {
  if (!Number.isFinite(v)) return "—";
  if (v !== 0 && (Math.abs(v) >= 1e15 || Math.abs(v) < 1e-6)) return v.toExponential(6).replace(/\.?0+e/, "e");
  return Number(v.toPrecision(10)).toLocaleString(undefined, { maximumFractionDigits: 10 });
}

/** Converts between units of length, weight, temperature, data and more. Click a result to copy it. */
export function UnitTool({ copy }: { copy: Copy }) {
  const [cat, setCat] = useState(0);
  const [from, setFrom] = useState(2);
  const [value, setValue] = useState("1");
  const category = CATEGORIES[cat];
  const fromUnit = category.units[Math.min(from, category.units.length - 1)];
  const n = Number(value.replace(/,/g, ""));
  const base = value.trim() && Number.isFinite(n) ? toBase(fromUnit, n) : NaN;

  return (
    <div className="tool-body">
      <select
        className="tool-input"
        aria-label="Kind of unit"
        value={cat}
        onChange={(e) => {
          const next = Number(e.target.value);
          setCat(next);
          setFrom(CATEGORIES[next].units.length > 2 ? 2 : 0);
        }}
      >
        {CATEGORIES.map((c, i) => (
          <option key={c.name} value={i}>
            {c.name}
          </option>
        ))}
      </select>
      <div className="unit-from">
        <input className="tool-input" inputMode="decimal" aria-label="Value" value={value} onChange={(e) => setValue(e.target.value)} />
        <select className="tool-input" aria-label="From unit" value={Math.min(from, category.units.length - 1)} onChange={(e) => setFrom(Number(e.target.value))}>
          {category.units.map((unit, i) => (
            <option key={unit.name} value={i}>
              {unit.name} ({unit.symbol})
            </option>
          ))}
        </select>
      </div>
      <div className="unit-results">
        {category.units.map((unit) => {
          const out = Number.isNaN(base) ? "—" : format(fromBase(unit, base));
          return (
            <button key={unit.name} className={`unit-row${unit === fromUnit ? " is-from" : ""}`} title="Copy" disabled={out === "—"} onClick={() => copy(`${out} ${unit.symbol}`)}>
              <span>{unit.name}</span>
              <strong>
                {out} <small>{unit.symbol}</small>
              </strong>
            </button>
          );
        })}
      </div>
      <p className="tool-hint">Click a result to copy it. Months and years are averages (365.2425 days a year).</p>
    </div>
  );
}
