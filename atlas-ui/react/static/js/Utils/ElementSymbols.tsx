// atlas-ui/react/static/js/Utils/ElementSymbols.tsx

import React from "react";

export interface ElementInfo {
  symbol: string;
  atomicNumber: number | string;
  category: string;
}

export const ELEMENT_SYMBOLS: { [key: string]: ElementInfo } = {
  Hydrogen: { symbol: "H", atomicNumber: 1, category: "nonmetal" },
  Helium: { symbol: "He", atomicNumber: 2, category: "noble-gas" },
  Lithium: { symbol: "Li", atomicNumber: 3, category: "alkali-metal" },
  Beryllium: { symbol: "Be", atomicNumber: 4, category: "alkaline-earth" },
  Boron: { symbol: "B", atomicNumber: 5, category: "metalloid" },
  Carbon: { symbol: "C", atomicNumber: 6, category: "nonmetal" },
  Nitrogen: { symbol: "N", atomicNumber: 7, category: "nonmetal" },
  Oxygen: { symbol: "O", atomicNumber: 8, category: "nonmetal" },
  Fluorine: { symbol: "F", atomicNumber: 9, category: "halogen" },
  Neon: { symbol: "Ne", atomicNumber: 10, category: "noble-gas" },

  Sodium: { symbol: "Na", atomicNumber: 11, category: "alkali-metal" },
  Magnesium: { symbol: "Mg", atomicNumber: 12, category: "alkaline-earth" },
  Aluminum: { symbol: "Al", atomicNumber: 13, category: "post-transition" },
  Silicon: { symbol: "Si", atomicNumber: 14, category: "metalloid" },
  Phosphorus: { symbol: "P", atomicNumber: 15, category: "nonmetal" },
  Sulfur: { symbol: "S", atomicNumber: 16, category: "nonmetal" },
  Chlorine: { symbol: "Cl", atomicNumber: 17, category: "halogen" },
  Argon: { symbol: "Ar", atomicNumber: 18, category: "noble-gas" },

  Potassium: { symbol: "K", atomicNumber: 19, category: "alkali-metal" },
  Calcium: { symbol: "Ca", atomicNumber: 20, category: "alkaline-earth" },
  Scandium: { symbol: "Sc", atomicNumber: 21, category: "transition-metal" },
  Titanium: { symbol: "Ti", atomicNumber: 22, category: "transition-metal" },
  Vanadium: { symbol: "V", atomicNumber: 23, category: "transition-metal" },
  Chromium: { symbol: "Cr", atomicNumber: 24, category: "transition-metal" },
  Manganese: { symbol: "Mn", atomicNumber: 25, category: "transition-metal" },
  Iron: { symbol: "Fe", atomicNumber: 26, category: "transition-metal" },
  Cobalt: { symbol: "Co", atomicNumber: 27, category: "transition-metal" },
  Nickel: { symbol: "Ni", atomicNumber: 28, category: "transition-metal" },
  Copper: { symbol: "Cu", atomicNumber: 29, category: "transition-metal" },
  Zinc: { symbol: "Zn", atomicNumber: 30, category: "post-transition" },
  Gallium: { symbol: "Ga", atomicNumber: 31, category: "post-transition" },
  Germanium: { symbol: "Ge", atomicNumber: 32, category: "metalloid" },
  Arsenic: { symbol: "As", atomicNumber: 33, category: "metalloid" },
  Selenium: { symbol: "Se", atomicNumber: 34, category: "nonmetal" },
  Bromine: { symbol: "Br", atomicNumber: 35, category: "halogen" },
  Krypton: { symbol: "Kr", atomicNumber: 36, category: "noble-gas" },

  Rubidium: { symbol: "Rb", atomicNumber: 37, category: "alkali-metal" },
  Strontium: { symbol: "Sr", atomicNumber: 38, category: "alkaline-earth" },
  Yttrium: { symbol: "Y", atomicNumber: 39, category: "transition-metal" },
  Zirconium: { symbol: "Zr", atomicNumber: 40, category: "transition-metal" },
  Niobium: { symbol: "Nb", atomicNumber: 41, category: "transition-metal" },
  Molybdenum: { symbol: "Mo", atomicNumber: 42, category: "transition-metal" },
  Technetium: { symbol: "Tc", atomicNumber: 43, category: "transition-metal" },
  Ruthenium: { symbol: "Ru", atomicNumber: 44, category: "transition-metal" },
  Rhodium: { symbol: "Rh", atomicNumber: 45, category: "transition-metal" },
  Palladium: { symbol: "Pd", atomicNumber: 46, category: "transition-metal" },
  Silver: { symbol: "Ag", atomicNumber: 47, category: "transition-metal" },
  Cadmium: { symbol: "Cd", atomicNumber: 48, category: "post-transition" },
  Indium: { symbol: "In", atomicNumber: 49, category: "post-transition" },
  Tin: { symbol: "Sn", atomicNumber: 50, category: "post-transition" },
  Antimony: { symbol: "Sb", atomicNumber: 51, category: "metalloid" },
  Tellurium: { symbol: "Te", atomicNumber: 52, category: "metalloid" },
  Iodine: { symbol: "I", atomicNumber: 53, category: "halogen" },
  Xenon: { symbol: "Xe", atomicNumber: 54, category: "noble-gas" },

  Cesium: { symbol: "Cs", atomicNumber: 55, category: "alkali-metal" },
  Barium: { symbol: "Ba", atomicNumber: 56, category: "alkaline-earth" },

  Lanthanum: { symbol: "La", atomicNumber: 57, category: "lanthanide" },
  Cerium: { symbol: "Ce", atomicNumber: 58, category: "lanthanide" },
  Praseodymium: { symbol: "Pr", atomicNumber: 59, category: "lanthanide" },
  Neodymium: { symbol: "Nd", atomicNumber: 60, category: "lanthanide" },
  Promethium: { symbol: "Pm", atomicNumber: 61, category: "lanthanide" },
  Samarium: { symbol: "Sm", atomicNumber: 62, category: "lanthanide" },
  Europium: { symbol: "Eu", atomicNumber: 63, category: "lanthanide" },
  Gadolinium: { symbol: "Gd", atomicNumber: 64, category: "lanthanide" },
  Terbium: { symbol: "Tb", atomicNumber: 65, category: "lanthanide" },
  Dysprosium: { symbol: "Dy", atomicNumber: 66, category: "lanthanide" },
  Holmium: { symbol: "Ho", atomicNumber: 67, category: "lanthanide" },
  Erbium: { symbol: "Er", atomicNumber: 68, category: "lanthanide" },
  Thulium: { symbol: "Tm", atomicNumber: 69, category: "lanthanide" },
  Ytterbium: { symbol: "Yb", atomicNumber: 70, category: "lanthanide" },
  Lutetium: { symbol: "Lu", atomicNumber: 71, category: "lanthanide" },

  Hafnium: { symbol: "Hf", atomicNumber: 72, category: "transition-metal" },
  Tantalum: { symbol: "Ta", atomicNumber: 73, category: "transition-metal" },
  Tungsten: { symbol: "W", atomicNumber: 74, category: "transition-metal" },
  Rhenium: { symbol: "Re", atomicNumber: 75, category: "transition-metal" },
  Osmium: { symbol: "Os", atomicNumber: 76, category: "transition-metal" },
  Iridium: { symbol: "Ir", atomicNumber: 77, category: "transition-metal" },
  Platinum: { symbol: "Pt", atomicNumber: 78, category: "transition-metal" },
  Gold: { symbol: "Au", atomicNumber: 79, category: "transition-metal" },
  Mercury: { symbol: "Hg", atomicNumber: 80, category: "post-transition" },
  Thallium: { symbol: "Tl", atomicNumber: 81, category: "post-transition" },
  Lead: { symbol: "Pb", atomicNumber: 82, category: "post-transition" },
  Bismuth: { symbol: "Bi", atomicNumber: 83, category: "post-transition" },
  Polonium: { symbol: "Po", atomicNumber: 84, category: "post-transition" },
  Astatine: { symbol: "At", atomicNumber: 85, category: "halogen" },
  Radon: { symbol: "Rn", atomicNumber: 86, category: "noble-gas" },

  Francium: { symbol: "Fr", atomicNumber: 87, category: "alkali-metal" },
  Radium: { symbol: "Ra", atomicNumber: 88, category: "alkaline-earth" },

  Actinium: { symbol: "Ac", atomicNumber: 89, category: "actinide" },
  Thorium: { symbol: "Th", atomicNumber: 90, category: "actinide" },
  Protactinium: { symbol: "Pa", atomicNumber: 91, category: "actinide" },
  Uranium: { symbol: "U", atomicNumber: 92, category: "actinide" },
  Neptunium: { symbol: "Np", atomicNumber: 93, category: "actinide" },
  Plutonium: { symbol: "Pu", atomicNumber: 94, category: "actinide" },
  Americium: { symbol: "Am", atomicNumber: 95, category: "actinide" },
  Curium: { symbol: "Cm", atomicNumber: 96, category: "actinide" },
  Berkelium: { symbol: "Bk", atomicNumber: 97, category: "actinide" },
  Californium: { symbol: "Cf", atomicNumber: 98, category: "actinide" },
  Einsteinium: { symbol: "Es", atomicNumber: 99, category: "actinide" },
  Fermium: { symbol: "Fm", atomicNumber: 100, category: "actinide" },
  Mendelevium: { symbol: "Md", atomicNumber: 101, category: "actinide" },
  Nobelium: { symbol: "No", atomicNumber: 102, category: "actinide" },
  Lawrencium: { symbol: "Lr", atomicNumber: 103, category: "actinide" },

  Rutherfordium: { symbol: "Rf", atomicNumber: 104, category: "transition-metal" },
  Dubnium: { symbol: "Db", atomicNumber: 105, category: "transition-metal" },
  Seaborgium: { symbol: "Sg", atomicNumber: 106, category: "transition-metal" },
  Bohrium: { symbol: "Bh", atomicNumber: 107, category: "transition-metal" },
  Hassium: { symbol: "Hs", atomicNumber: 108, category: "transition-metal" },
  Meitnerium: { symbol: "Mt", atomicNumber: 109, category: "transition-metal" },
  Darmstadtium: { symbol: "Ds", atomicNumber: 110, category: "transition-metal" },
  Roentgenium: { symbol: "Rg", atomicNumber: 111, category: "transition-metal" },
  Copernicium: { symbol: "Cn", atomicNumber: 112, category: "post-transition" },
  Nihonium: { symbol: "Nh", atomicNumber: 113, category: "post-transition" },
  Flerovium: { symbol: "Fl", atomicNumber: 114, category: "post-transition" },
  Moscovium: { symbol: "Mc", atomicNumber: 115, category: "post-transition" },
  Livermorium: { symbol: "Lv", atomicNumber: 116, category: "post-transition" },
  Tennessine: { symbol: "Ts", atomicNumber: 117, category: "halogen" },
  Oganesson: { symbol: "Og", atomicNumber: 118, category: "noble-gas" },

  Tritium: { symbol: "T", atomicNumber: 1, category: "isotope" },
  "Z-Divinium": { symbol: "Zd", atomicNumber: 119, category: "synthetic" },
};

export const ELEMENT_CATEGORY_COLORS = {
  nonmetal: "bg-blue-500/20 border-blue-500/50 text-blue-300",
  "noble-gas": "bg-purple-500/20 border-purple-500/50 text-purple-300",
  "alkali-metal": "bg-red-500/20 border-red-500/50 text-red-300",
  "alkaline-earth": "bg-orange-500/20 border-orange-500/50 text-orange-300",
  "transition-metal": "bg-yellow-500/20 border-yellow-500/50 text-yellow-300",
  "post-transition": "bg-green-500/20 border-green-500/50 text-green-300",
  metalloid: "bg-cyan-500/20 border-cyan-500/50 text-cyan-300",
  halogen: "bg-pink-500/20 border-pink-500/50 text-pink-300",
  lanthanide: "bg-indigo-500/20 border-indigo-500/50 text-indigo-300",
  actinide: "bg-red-600/20 border-red-600/50 text-red-400",
  isotope: "bg-emerald-500/20 border-emerald-500/50 text-emerald-300",
  synthetic: "bg-violet-500/20 border-violet-500/50 text-violet-300",
  compound: "bg-teal-500/20 border-teal-500/50 text-teal-300",
};

export const getRarityColor = (rarityTier: string): string => {
  switch (rarityTier) {
    case "Exception":
      return "bg-cyan-500/40 hover:bg-purple-600/40 border-2 border-cyan-400/90 text-cyan-100 shadow-lg shadow-cyan-400/30 animate-pulse";
    case "Ultra Rare":
      return "bg-violet-600/30 border-violet-400/80 text-violet-200 shadow-violet-400/20";
    case "Extremely Rare":
      return "bg-purple-600/30 border-purple-400/80 text-purple-200 shadow-purple-400/20";
    case "Very Rare":
      return "bg-pink-600/30 border-pink-400/80 text-pink-200 shadow-pink-400/20";
    case "Rare":
      return "bg-red-600/30 border-red-400/80 text-red-200 shadow-red-400/20";
    case "Uncommon":
      return "bg-orange-500/30 border-orange-400/80 text-orange-200 shadow-orange-400/20";
    case "Common":
      return "bg-yellow-500/30 border-yellow-400/80 text-yellow-200 shadow-yellow-400/20";
    case "Very Common":
      return "bg-green-500/30 border-green-400/80 text-green-200 shadow-green-400/20";
    case "Abundant":
      return "bg-blue-500/30 border-blue-400/80 text-blue-200 shadow-blue-400/20";
    case "Basic":
      return "bg-gray-500/30 border-gray-400/80 text-gray-200 shadow-gray-400/20";
    default:
      return "bg-gray-500/30 border-gray-400/80 text-gray-200 shadow-gray-400/20";
  }
};
