// Engineering drawings used across the site. Each file is line art stored as an alpha mask (white lines, transparent
// paper), so CSS colours it with the theme's ink: blue on paper in light mode, a blueprint in dark mode.
// The files live in public/drawings so the static pages (universities, demo) can use them too.
// Rebuild them with scripts/drawings (fetch.py, then process.py). All are public domain; /#/credits lists them.
const at = (file: string) => `${import.meta.env.BASE_URL}drawings/${file}.webp`;

export type DrawingName = 'artOfMilling' | 'caneMillLine' | 'encyclopedie' | 'engineIsometric' | 'gearsTrain' | 'millGearing' | 'molino' | 'beamEngine';
export const drawingUrl: Record<Exclude<DrawingName, 'beamEngine'>, string> = {
  artOfMilling: at('art-of-milling'), caneMillLine: at('cane-mill-line'), encyclopedie: at('encyclopedie-1765'), engineIsometric: at('engine-isometric'),
  gearsTrain: at('gears-train'), millGearing: at('mill-gearing'), molino: at('molino'),
};
export const engineLayers = { base: at('engine-base'), flywheel: at('engine-flywheel'), governor: at('engine-governor') };

export type Credit = { name: DrawingName; title: string; place: string; source: string; url: string; usedFor: string };
const haer = 'Historic American Engineering Record, Library of Congress (public domain)';
export const credits: Credit[] = [
  { name: 'beamEngine', title: 'Steam engine and cane mill, engine north elevation (sheet 3 of 4)', place: 'Estate Rust-Op-Twist, Christiansted, St Croix', source: haer, usedFor: 'Home page: the running engine', url: 'https://commons.wikimedia.org/wiki/File:Engine_North_Elevation,_North_East_Elevation_-_Estate_Rust-Op-Twist,_Steam_Engine_and_Cane_Mill,_Christiansted,_St._Croix,_VI_HAER_VI,1-NORT,1-A-_(sheet_3_of_4).png' },
  { name: 'caneMillLine', title: 'Sugar mill ruins and steam engine, north elevation of machinery (sheet 3 of 6)', place: 'Hacienda Azucarera la Igualdad, Guánica, Puerto Rico', source: haer, usedFor: 'How it works', url: 'https://commons.wikimedia.org/wiki/File:Hacienda_Azucarera_la_Igualdad,_Sugar_Mill_Ruins_and_Steam_Engine,_PR_Route_332,_Guanica,_Guanica_Municipio,_PR_HAER_PR,35-GUAN.V,1A-_(sheet_3_of_6).tif' },
  { name: 'gearsTrain', title: 'Marine railway, machinery elevations and plans (sheet 7 of 9)', place: 'Creque Marine Railway, Hassel Island, St Thomas', source: haer, usedFor: 'Company machine', url: 'https://commons.wikimedia.org/wiki/File:Machinery,_Elevation_and_Plans_-_Creque_Marine_Railway,_Charlotte_Amalie,_St._Thomas,_VI_HAER_VI,3-HASI,1-_(sheet_7_of_9).tif' },
  { name: 'engineIsometric', title: 'Overhead crank steam engine, engine isometric (sheet 2 of 2)', place: 'Estate Whim, Frederiksted, St Croix', source: haer, usedFor: 'CEO mode', url: 'https://commons.wikimedia.org/wiki/File:Engine_Isometric_-_Estate_Whim,_Overhead_Crank_Steam_Engine_and_Cane_Mill,_Westend_Quarter,_Centerline_Road,_Frederiksted,_St._Croix,_VI_HAER_VI,1-WEST,1C-_(sheet_2_of_2).png' },
  { name: 'artOfMilling', title: "Betz's Mill, the art of milling (sheet 7 of 9)", place: 'Lynnville, Lehigh County, Pennsylvania', source: haer, usedFor: 'Live 3D company', url: 'https://commons.wikimedia.org/wiki/File:Betz%27s_Mill,_Bausch_Road_on_Switzer_Creek,_1.5_miles_southeast_of_Lynnville,_Lynnville,_Lehigh_County,_PA_HAER_PA,39-LYNVI.V,1-_(sheet_7_of_9).tif' },
  { name: 'millGearing', title: "Betz's Mill, wallower and runner-stone gearing (sheet 6 of 9)", place: 'Lynnville, Lehigh County, Pennsylvania', source: haer, usedFor: 'Going Concern Modules', url: 'https://commons.wikimedia.org/wiki/File:Betz%27s_Mill,_Bausch_Road_on_Switzer_Creek,_1.5_miles_southeast_of_Lynnville,_Lynnville,_Lehigh_County,_PA_HAER_PA,39-LYNVI.V,1-_(sheet_6_of_9).png' },
  { name: 'molino', title: 'Truchas molino, machinery (sheet 4 of 5)', place: 'La Cienega Acequia, Santa Fe, New Mexico', source: haer, usedFor: 'Build your own business', url: 'https://commons.wikimedia.org/wiki/File:Machinery_-_La_Cienega_Acequia,_Truchas_Molino,_334_Los_Pinos_Road,_Santa_Fe,_Santa_Fe_County,_NM_HAER_NM-14-A_(sheet_4_of_5).tif' },
  { name: 'encyclopedie', title: 'Recueil de planches sur les sciences, les arts libéraux et les arts méchaniques (1765)', place: "Diderot and d'Alembert, Encyclopédie", source: 'Internet Archive Book Images (public domain, no known restrictions)', usedFor: 'Universities', url: 'https://commons.wikimedia.org/wiki/File:Recueil_de_planches,_sur_les_sciences,_les_arts_lib%C3%A9raux,_et_les_arts_m%C3%A9chaniques_-_avec_leur_explication_(1765)_(14761524246).jpg' },
];
