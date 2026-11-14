/**
 * CFR OS: Luxury Digital Guest Menu & Catalog Engine
 * Manages 7 signature menu sections, artisanal tasting notes, craft stories,
 * strict ₹10 price increments, and real-time 86'd availability.
 */

import type Database from 'better-sqlite3';
import { CfrMenuItem, CfrMenuSection } from '../types/menu-adapters';

export class InvalidMenuPriceError extends Error {
  constructor(message: string) {
    super(`[CFR Menu Guard] Invalid Price: ${message}`);
    this.name = 'InvalidMenuPriceError';
  }
}

export class DietaryComplianceError extends Error {
  constructor(message: string) {
    super(`[CFR Dietary Policy Violation] ${message}`);
    this.name = 'DietaryComplianceError';
  }
}

/**
 * Validates that a menu price strictly complies with CFR's ₹10 increment policy.
 */
export function validateMenuPricePaise(pricePaise: number): void {
  if (!Number.isInteger(pricePaise) || pricePaise <= 0) {
    throw new InvalidMenuPriceError('Price must be a positive integer in paise.');
  }
  if (pricePaise % 1000 !== 0) {
    throw new InvalidMenuPriceError(
      `Price ${pricePaise} paise (₹${pricePaise / 100}) violates strict ₹10 price increments policy.`
    );
  }
}

/**
 * Retrieves the complete public digital menu grouped into the 7 signature sections.
 */
export function getPublicDigitalMenu(
  db: Database.Database,
  includeUnavailable = true,
): {
  brand: string;
  location: string;
  dietary_policy: string;
  tax_policy: string;
  sections: Array<CfrMenuSection & { items: CfrMenuItem[] }>;
} {
  const sections = db
    .prepare('SELECT * FROM cfr_menu_sections ORDER BY sort_order ASC')
    .all() as CfrMenuSection[];

  let itemQuery = 'SELECT * FROM cfr_menu_items';
  if (!includeUnavailable) {
    itemQuery += ' WHERE is_available = 1';
  }
  itemQuery += ' ORDER BY sort_order ASC';

  const allItems = db.prepare(itemQuery).all() as Array<
    Omit<CfrMenuItem, 'price_rupees' | 'is_available'> & { is_available: number }
  >;

  const itemsBySection = new Map<string, CfrMenuItem[]>();
  for (const item of allItems) {
    const formattedItem: CfrMenuItem = {
      ...item,
      price_rupees: item.price_paise / 100,
      is_available: item.is_available === 1,
    };
    const list = itemsBySection.get(item.section_id) || [];
    list.push(formattedItem);
    itemsBySection.set(item.section_id, list);
  }

  const sectionsWithItems = sections.map((sec) => ({
    ...sec,
    items: itemsBySection.get(sec.id) || [],
  }));

  return {
    brand: 'Coffee First Ritual (CFR)',
    location: 'Sector 12, Karnal, Haryana',
    dietary_policy: '100% Vegetarian & Artisanal Eggless (Strict Zero Tolerance)',
    tax_policy: 'Prices Exclude 5% Haryana GST (2.5% CGST + 2.5% SGST)',
    sections: sectionsWithItems,
  };
}

/**
 * Retrieves a single menu item with full tasting notes, craft story, and terroir details.
 */
export function getMenuItemById(db: Database.Database, itemId: string): CfrMenuItem | null {
  const row = db.prepare('SELECT * FROM cfr_menu_items WHERE id = ?').get(itemId) as any;
  if (!row) return null;

  return {
    ...row,
    price_rupees: row.price_paise / 100,
    is_available: row.is_available === 1,
  };
}

/**
 * Toggles an item's real-time 86'd / sold-out availability on the guest digital menu.
 */
export function setMenuItemAvailability(
  db: Database.Database,
  itemId: string,
  isAvailable: boolean,
): CfrMenuItem {
  const result = db
    .prepare('UPDATE cfr_menu_items SET is_available = ? WHERE id = ?')
    .run(isAvailable ? 1 : 0, itemId);

  if (result.changes === 0) {
    throw new Error(`Menu item "${itemId}" not found.`);
  }

  const updated = getMenuItemById(db, itemId);
  if (!updated) {
    throw new Error(`Failed to load updated menu item "${itemId}".`);
  }
  return updated;
}

/**
 * Seeds standard 7 signature sections and handcrafted specialty items.
 */
export function seedStandardMenuAndEquipment(db: Database.Database): void {
  const sectionCount = (
    db.prepare('SELECT COUNT(*) as count FROM cfr_menu_sections').get() as { count: number }
  ).count;

  if (sectionCount === 0) {
    db.transaction(() => {
      // 1. Seed 7 Signature Sections
      const insertSection = db.prepare(`
        INSERT INTO cfr_menu_sections (id, title, subtitle, sort_order)
        VALUES (?, ?, ?, ?)
      `);

      const sections: CfrMenuSection[] = [
        {
          id: 'sec_espresso',
          title: 'Espresso Bar',
          subtitle: 'Direct-Trade Estate Extractions & Silky A2 Milk Harmony',
          sort_order: 1,
        },
        {
          id: 'sec_manual_brew',
          title: 'Manual Brew Theatre',
          subtitle: 'Single Origin Terroir Pour-Overs & Cold Kyoto Extractions',
          sort_order: 2,
        },
        {
          id: 'sec_cold_rituals',
          title: 'Cold Rituals',
          subtitle: 'Chilled Elixirs, Sparkling Cascara & Hand-Shaken Coffees',
          sort_order: 3,
        },
        {
          id: 'sec_beyond_coffee',
          title: 'Beyond Coffee',
          subtitle: 'First-Harvest Uji Matcha, Valrhona Chocolates & Botanicals',
          sort_order: 4,
        },
        {
          id: 'sec_boulangerie',
          title: 'Boulangerie',
          subtitle: 'Artisanal Eggless Laminated Viennoiserie & French Pastries',
          sort_order: 5,
        },
        {
          id: 'sec_savory',
          title: 'Savory & Tartines',
          subtitle: 'Slow-Ferment Sourdough Tartines & Artisan Cheese Melts',
          sort_order: 6,
        },
        {
          id: 'sec_evening_bowls',
          title: 'Evening Bowls',
          subtitle: 'Artisanal Smoked Burrata, Polenta & Organic Superfood Bowls',
          sort_order: 7,
        },
      ];

      for (const s of sections) {
        insertSection.run(s.id, s.title, s.subtitle, s.sort_order);
      }

      // 2. Seed Signature Menu Items
      const insertItem = db.prepare(`
        INSERT INTO cfr_menu_items (
          id, section_id, product_id, name, tagline, price_paise,
          description, tasting_notes, craft_story, origin, dietary_flags,
          is_available, sort_order, calories
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const items: Array<Omit<CfrMenuItem, 'price_rupees'>> = [
        // ── 1. Espresso Bar ──────────────────────────────────────────────
        {
          id: 'item_double_espresso',
          section_id: 'sec_espresso',
          product_id: null,
          name: 'Signature Double Espresso',
          tagline: '18.5g in • 38g out • 28s extraction',
          price_paise: 22000, // ₹220
          description: 'A concentrated, aromatic double shot pulled on our custom La Marzocco KB90.',
          tasting_notes: 'Jasmine, stone fruit sweetness, crisp orange acidity, velvet body.',
          craft_story:
            'Extracted from Ratnagiri Estate Microlot #24B. Harvested at 1,400m altitude and processed with 72-hour anaerobic slow drying.',
          origin: 'Ratnagiri Estate, Bababudangiri, Karnataka',
          dietary_flags: 'VEGAN,EGGLESS',
          is_available: true,
          sort_order: 1,
          calories: 5,
        },
        {
          id: 'item_cortado',
          section_id: 'sec_espresso',
          product_id: null,
          name: 'Artisanal Cortado',
          tagline: '1:1 ratio • 60°C microfoam',
          price_paise: 24000, // ₹240
          description: 'Equal parts vibrant double espresso and delicately steamed local fresh A2 whole cow milk.',
          tasting_notes: 'Hazelnut praline, caramelized brown sugar, silky cocoa finish.',
          craft_story:
            'Designed to cut through high-elevation acidity while preserving delicate terroir florals. Served in a custom 130ml Libbey Gibraltar glass.',
          origin: 'Bababudangiri & Local Haryana A2 Dairy',
          dietary_flags: 'LACTO_VEG,EGGLESS',
          is_available: true,
          sort_order: 2,
          calories: 85,
        },
        {
          id: 'item_flat_white',
          section_id: 'sec_espresso',
          product_id: null,
          name: 'Velvet Flat White',
          tagline: 'Double ristretto • Micro-textured A2 milk',
          price_paise: 26000, // ₹260
          description: 'A double ristretto foundation blanketed with glossy, tight-bubble microfoam.',
          tasting_notes: 'Malted milk chocolate, roasted almond, honey sweetness.',
          craft_story:
            'Steamed to precisely 62°C to maximize natural milk lactose sweetness without needing added sugar.',
          origin: 'Blue Tokai Attikan Estate & Local A2 Dairy',
          dietary_flags: 'LACTO_VEG,EGGLESS',
          is_available: true,
          sort_order: 3,
          calories: 130,
        },
        {
          id: 'item_cappuccino',
          section_id: 'sec_espresso',
          product_id: null,
          name: 'Classic Artisanal Cappuccino',
          tagline: 'Cacao dusted • Deep velvety crema',
          price_paise: 26000, // ₹260
          description: 'Harmonious third espresso, third steamed milk, and third cloud microfoam dusted with Valrhona cocoa.',
          tasting_notes: 'Dark chocolate, toasted walnut, creamy bourbon vanilla.',
          craft_story:
            'Finished with single-origin Valrhona Guanaja cocoa powder ground fresh over the foam.',
          origin: 'Biligirirangana Hills, Karnataka',
          dietary_flags: 'LACTO_VEG,EGGLESS',
          is_available: true,
          sort_order: 4,
          calories: 120,
        },
        {
          id: 'item_spanish_latte',
          section_id: 'sec_espresso',
          product_id: null,
          name: 'Bourbon Vanilla Spanish Latte',
          tagline: 'Condensed milk • Madagascar vanilla pod',
          price_paise: 28000, // ₹280
          description: 'Espresso poured over house-made caramelized condensed milk infused with whole Madagascar vanilla beans.',
          tasting_notes: 'Dulce de leche, bourbon vanilla, roasted pecan.',
          craft_story:
            'Slowly reduced over low flame with raw Khandsari cane sugar to avoid scorched bitterness.',
          origin: 'Karnataka Specialty Lot & Madagascar Bourbon Vanilla',
          dietary_flags: 'LACTO_VEG,EGGLESS',
          is_available: true,
          sort_order: 5,
          calories: 210,
        },

        // ── 2. Manual Brew Theatre ──────────────────────────────────────
        {
          id: 'item_v60_pourover',
          section_id: 'sec_manual_brew',
          product_id: null,
          name: 'V60 Single Origin Pourover',
          tagline: 'Hario V60 • 15g in • 250ml out • 3:15 min',
          price_paise: 30000, // ₹300
          description: 'A clarity-driven manual filter brew highlighting the crystalline florals of high-altitude terroir.',
          tasting_notes: 'White jasmine, bergamot, yellow peach, honey crisp finish.',
          craft_story:
            'Brewed at 92°C with mineral-balanced brew water (85 ppm). Three-stage spiral pour over bleached Japanese paper filter.',
          origin: 'Ratnagiri Estate (1,400m AMSL), Karnataka',
          dietary_flags: 'VEGAN,EGGLESS',
          is_available: true,
          sort_order: 1,
          calories: 4,
        },
        {
          id: 'item_aeropress_inverted',
          section_id: 'sec_manual_brew',
          product_id: null,
          name: 'Aeropress Inverted Brew',
          tagline: 'Full immersion • Pressure extracted',
          price_paise: 28000, // ₹280
          description: 'Immersion brewing meets pneumatic pressure for juicy acidity and profound body.',
          tasting_notes: 'Black cherry, dark cacao, red grape, juicy lingering mouthfeel.',
          craft_story:
            'Steeped inverted for 2 minutes before gentle 30-second press through double metal-paper hybrid filtration.',
          origin: 'Attikan Estate, Biligirirangana Hills',
          dietary_flags: 'VEGAN,EGGLESS',
          is_available: true,
          sort_order: 2,
          calories: 5,
        },
        {
          id: 'item_kyoto_cold_brew',
          section_id: 'sec_manual_brew',
          product_id: null,
          name: '18-Hour Kyoto Slow Drip',
          tagline: 'Drop-by-drop cold water extraction',
          price_paise: 28000, // ₹280
          description: 'Extracted drop by drop over 18 hours using chilled mountain spring water in our glass Dutch drip tower.',
          tasting_notes: 'Dark chocolate liqueur, dried fig, tobacco leaf, smooth velvet.',
          craft_story:
            'Zero heat extraction preserves volatile aromatics while eliminating bitter tannins. Served over crystal clear ice rock.',
          origin: 'Subko Specialty Reserve (Lot #24B)',
          dietary_flags: 'VEGAN,EGGLESS',
          is_available: true,
          sort_order: 3,
          calories: 6,
        },

        // ── 3. Cold Rituals ─────────────────────────────────────────────
        {
          id: 'item_tonic_espresso',
          section_id: 'sec_cold_rituals',
          product_id: null,
          name: 'Citrus Tonic Espresso',
          tagline: 'Artisanal Indian tonic • Dehydrated blood orange',
          price_paise: 32000, // ₹320
          description: 'Crisp botanical Indian tonic water crowned with a floating shot of single-origin espresso.',
          tasting_notes: 'Quinine citrus sparkle, ripe blackberry, effervescent crema.',
          craft_story:
            'Lightly infused with cold-pressed kaffir lime oil and garnished with solar-dehydrated orange wheels.',
          origin: 'Ratnagiri Estate & Bengal Botanicals Tonic',
          dietary_flags: 'VEGAN,EGGLESS',
          is_available: true,
          sort_order: 1,
          calories: 75,
        },
        {
          id: 'item_shakerato',
          section_id: 'sec_cold_rituals',
          product_id: null,
          name: 'Iced Roman Shakerato',
          tagline: 'Hand-shaken in Japanese cocktail tin',
          price_paise: 28000, // ₹280
          description: 'Fresh double espresso hard-shaken over ice with organic raw cane sugar and organic orange peel.',
          tasting_notes: 'Silky micro-foam head, toasted caramel, candied citrus zest.',
          craft_story:
            'Shaken vigorously for 20 seconds to aerate crema into a creamy, dessert-like texture without dairy.',
          origin: 'Subko Reserve & Khandsari Raw Sugar',
          dietary_flags: 'VEGAN,EGGLESS',
          is_available: true,
          sort_order: 2,
          calories: 55,
        },
        {
          id: 'item_iced_oat_latte',
          section_id: 'sec_cold_rituals',
          product_id: null,
          name: 'Iced Oatly Barista Latte',
          tagline: 'Chilled Swedish oat milk • Double shot',
          price_paise: 32000, // ₹320
          description: 'Naturally sweet Oatly Barista Edition oat milk poured over crystal ice and pulled espresso.',
          tasting_notes: 'Roasted oats, hazelnut butter, cocoa nib, gentle malty finish.',
          craft_story:
            'Our standard 100% plant-based signature cold drink, naturally balanced without syrups.',
          origin: 'Blue Tokai Attikan & Oatly Sweden',
          dietary_flags: 'VEGAN,EGGLESS',
          is_available: true,
          sort_order: 3,
          calories: 140,
        },

        // ── 4. Beyond Coffee ────────────────────────────────────────────
        {
          id: 'item_uji_matcha_latte',
          section_id: 'sec_beyond_coffee',
          product_id: null,
          name: 'Uji Ceremonial Matcha Latte',
          tagline: 'First harvest stoneground • Kyoto, Japan',
          price_paise: 34000, // ₹340
          description: 'Single-cultivar ceremonial grade green tea whisked with bamboo chasen and velvety oat milk.',
          tasting_notes: 'Vibrant umami, sweet young grass, pistachio cream, zero bitterness.',
          craft_story:
            'Imported directly from Uji, Kyoto. Shade-grown for 30 days before hand-picking and granite stone milling.',
          origin: 'Uji, Kyoto Prefecture, Japan',
          dietary_flags: 'VEGAN,EGGLESS',
          is_available: true,
          sort_order: 1,
          calories: 110,
        },
        {
          id: 'item_valrhona_hot_chocolate',
          section_id: 'sec_beyond_coffee',
          product_id: null,
          name: 'Valrhona Guanaja 70% Dark Chocolate',
          tagline: 'Single estate French chocolate • Steamed A2 milk',
          price_paise: 32000, // ₹320
          description: 'Pure 70% Guanaja dark chocolate melted slowly into velvety steamed milk with a pinch of sea salt.',
          tasting_notes: 'Intense roasted cocoa, floral warmth, molasses, red fruit undertones.',
          craft_story:
            'Crafted in Tain-l’Hermitage, France. Formulated without emulsifiers, gums, or artificial thickeners.',
          origin: 'Valrhona, France & Local A2 Dairy',
          dietary_flags: 'LACTO_VEG,EGGLESS',
          is_available: true,
          sort_order: 2,
          calories: 220,
        },
        {
          id: 'item_cascara_spritz',
          section_id: 'sec_beyond_coffee',
          product_id: null,
          name: 'Cascara Coffee Cherry Spritz',
          tagline: 'Dried coffee cherry tea • Sparkling yuzu',
          price_paise: 26000, // ₹260
          description: 'Sun-dried coffee fruit husks steeped like herbal tea, cooled and charged with effervescence.',
          tasting_notes: 'Rosehip, hibiscus, dried tamarind, refreshing botanical sparkle.',
          craft_story:
            'Upcycles the nutritious fruit surrounding coffee beans, reducing farm waste and offering antioxidant-rich refreshment.',
          origin: 'Ratnagiri Estate, Karnataka',
          dietary_flags: 'VEGAN,EGGLESS',
          is_available: true,
          sort_order: 3,
          calories: 45,
        },

        // ── 5. Boulangerie (100% Artisanal Eggless) ──────────────────────
        {
          id: 'item_croissant_butter',
          section_id: 'sec_boulangerie',
          product_id: null,
          name: '27-Layer French Butter Croissant',
          tagline: '100% Normandy cultured butter • Eggless lamination',
          price_paise: 24000, // ₹240
          description: 'Golden honeycomb interior with crisp shattering exterior. Made strictly without eggs.',
          tasting_notes: 'Cultured butter richness, sweet hazelnut crust, airy honeycomb texture.',
          craft_story:
            'Laminated with 84% butterfat Normandy butter and French T55 flour over a 72-hour cold-ferment cycle. Baked fresh at 6 AM in our Unox Combi.',
          origin: 'Normandy, France & Local Artisanal Bakehouse',
          dietary_flags: 'LACTO_VEG,EGGLESS',
          is_available: true,
          sort_order: 1,
          calories: 280,
        },
        {
          id: 'item_pain_au_chocolat',
          section_id: 'sec_boulangerie',
          product_id: null,
          name: 'Valrhona Pain au Chocolat',
          tagline: 'Twin Guanaja 70% chocolate batons',
          price_paise: 28000, // ₹280
          description: 'Flaky artisanal viennoiserie folded around two bars of rich French dark chocolate.',
          tasting_notes: 'Dark chocolate molten center, buttery crust, deep cocoa aroma.',
          craft_story:
            'Baked with Valrhona 70% baking batons that retain luscious chewiness when warm.',
          origin: 'Normandy Butter & Valrhona Chocolate',
          dietary_flags: 'LACTO_VEG,EGGLESS',
          is_available: true,
          sort_order: 2,
          calories: 320,
        },
        {
          id: 'item_pistachio_escargot',
          section_id: 'sec_boulangerie',
          product_id: null,
          name: 'Bronte Pistachio & Cardamom Escargot',
          tagline: '100% Bronte Sicilian pistachio paste swirl',
          price_paise: 32000, // ₹320
          description: 'A spiral of crisp laminated croissant pastry filled with pure pistachio cream and green cardamom.',
          tasting_notes: 'Roasted Sicilian pistachio, fragrant cardamom, caramelized sugar rim.',
          craft_story:
            'Filled with 100% stoneground Bronte pistachio paste (DOP certified) and aromatic Idukki green cardamom.',
          origin: 'Bronte, Sicily & Idukki, Kerala',
          dietary_flags: 'LACTO_VEG,EGGLESS',
          is_available: true,
          sort_order: 3,
          calories: 340,
        },
        {
          id: 'item_almond_frangipane',
          section_id: 'sec_boulangerie',
          product_id: null,
          name: 'Almond Frangipane Twice-Baked Croissant',
          tagline: 'Roasted almond cream • Flaked almonds',
          price_paise: 30000, // ₹300
          description: 'Day-fresh croissant steeped in light orange blossom syrup, filled with eggless almond cream.',
          tasting_notes: 'Marzipan sweetness, toasted almonds, delicate floral citrus hint.',
          craft_story:
            'Twice-baked until the almond cream sets into a moist, cake-like interior under a crisp flaked canopy.',
          origin: 'California Nonpareil Almonds & Normandy Butter',
          dietary_flags: 'LACTO_VEG,EGGLESS',
          is_available: true,
          sort_order: 4,
          calories: 380,
        },

        // ── 6. Savory & Tartines ────────────────────────────────────────
        {
          id: 'item_avocado_tartine',
          section_id: 'sec_savory',
          product_id: null,
          name: 'Hass Avocado & Sourdough Tartine',
          tagline: 'Slow-fermented sourdough • Za’atar • Cold-pressed olive oil',
          price_paise: 38000, // ₹380
          description: 'Thick toasted slice of 36-hour country sourdough topped with crushed Hass avocado and Lebanese za’atar.',
          tasting_notes: 'Creamy Haas avocado, nutty thyme za’atar, sourdough tang, sea salt flakes.',
          craft_story:
            'Made with our 5-year-old wild rye sourdough starter. Drizzled with early-harvest cold pressed extra virgin olive oil.',
          origin: 'House Sourdough & Mexican Hass Avocado',
          dietary_flags: 'VEGAN,EGGLESS',
          is_available: true,
          sort_order: 1,
          calories: 310,
        },
        {
          id: 'item_truffle_ricotta_toast',
          section_id: 'sec_savory',
          product_id: null,
          name: 'Whipped Truffle Ricotta Toast',
          tagline: 'House-made ricotta • White truffle honey • Walnuts',
          price_paise: 42000, // ₹420
          description: 'Artisanal ricotta whipped until fluffy, seasoned with sea salt, and dressed with Italian white truffle oil.',
          tasting_notes: 'Earthly white truffle aroma, milky fresh ricotta, wildflower honey, crunch.',
          craft_story:
            'Freshly curdled in-house each morning using whole cow milk and unpasteurized citrus acid.',
          origin: 'Haryana Dairy & Umbrian White Truffle',
          dietary_flags: 'LACTO_VEG,EGGLESS',
          is_available: true,
          sort_order: 2,
          calories: 340,
        },
        {
          id: 'item_mushroom_emmental_melt',
          section_id: 'sec_savory',
          product_id: null,
          name: 'Wild Mushroom & Emmental Sourdough Melt',
          tagline: 'Pan-roasted shiitake & portobello • Aged Swiss Emmental',
          price_paise: 40000, // ₹400
          description: 'Sautéed forest mushrooms, thyme, French Dijon mustard, and melted cave-aged Emmental cheese on sourdough.',
          tasting_notes: 'Savory umami, nutty melted cheese, garlic herb butter, toasted rye.',
          craft_story:
            'Pressed on our cast-iron plancha until cheese achieves a golden crust (frico) at the edges.',
          origin: 'Himachal Wild Mushrooms & Swiss Emmental',
          dietary_flags: 'LACTO_VEG,EGGLESS',
          is_available: true,
          sort_order: 3,
          calories: 410,
        },

        // ── 7. Evening Bowls ────────────────────────────────────────────
        {
          id: 'item_burrata_heirloom_salad',
          section_id: 'sec_evening_bowls',
          product_id: null,
          name: 'Smoked Burrata & Heirloom Tomato Bowl',
          tagline: 'Artisanal burrata • Farm tomatoes • Basil oil',
          price_paise: 48000, // ₹480
          description: 'Handcrafted creamy burrata ball over marinated Haryana farm heirloom tomatoes and aged balsamic.',
          tasting_notes: 'Sweet sun-ripened tomato, stracciatella cream, peppery basil, balsamic glaze.',
          craft_story:
            'Sourced from local hydroponic farms in Karnal. Tomatoes marinated in extra virgin olive oil and Maldon sea salt flakes.',
          origin: 'Karnal Farm Tomatoes & Artisanal Burrata',
          dietary_flags: 'LACTO_VEG,EGGLESS',
          is_available: true,
          sort_order: 1,
          calories: 360,
        },
        {
          id: 'item_truffled_polenta_bowl',
          section_id: 'sec_evening_bowls',
          product_id: null,
          name: 'Truffled Parmesan Polenta Bowl',
          tagline: 'Stoneground yellow corn • Rosemary crisp • Shaved parmesan',
          price_paise: 44000, // ₹440
          description: 'Creamy Italian stoneground polenta cooked with vegetable bouillon, cultured butter, and shaved parmesan.',
          tasting_notes: 'Warm buttery cornmeal, aged savory parmesan, aromatic fried rosemary.',
          craft_story:
            'Slow-cooked for 45 minutes with continuous stirring for a velvety, comforting evening texture.',
          origin: 'Lombardy Cornmeal & 24-Month Aged Parmesan',
          dietary_flags: 'LACTO_VEG,EGGLESS',
          is_available: true,
          sort_order: 2,
          calories: 390,
        },
        {
          id: 'item_acai_berry_ritual',
          section_id: 'sec_evening_bowls',
          product_id: null,
          name: 'Amazonian Acai Superfood Bowl',
          tagline: 'Organic acai • House buckwheat granola • Seasonal berries',
          price_paise: 42000, // ₹420
          description: 'Thick frozen organic acai blended with frozen bananas, topped with house-baked buckwheat granola and chia.',
          tasting_notes: 'Wild berry tartness, cocoa notes, toasted coconut, honey crunch.',
          craft_story:
            'Wild-harvested Amazonian acai berry puree blended with zero artificial concentrates or added syrup.',
          origin: 'Amazon Basin, Brazil & Local Strawberry Farms',
          dietary_flags: 'VEGAN,EGGLESS',
          is_available: true,
          sort_order: 3,
          calories: 290,
        },
      ];

      for (const item of items) {
        // Enforce the ₹10 price increment guard
        validateMenuPricePaise(item.price_paise);

        insertItem.run(
          item.id,
          item.section_id,
          item.product_id || null,
          item.name,
          item.tagline || null,
          item.price_paise,
          item.description,
          item.tasting_notes,
          item.craft_story,
          item.origin || null,
          item.dietary_flags,
          item.is_available ? 1 : 0,
          item.sort_order,
          item.calories || null,
        );
      }
    })();
    console.log('[CFR Menu] Seeded 7 signature sections and 21 handcrafted items.');
  }

  // 3. Seed Standard Equipment Checklist Tasks if empty
  const taskCount = (
    db.prepare('SELECT COUNT(*) as count FROM cfr_equipment_tasks').get() as { count: number }
  ).count;

  if (taskCount === 0) {
    db.transaction(() => {
      const insertTask = db.prepare(`
        INSERT INTO cfr_equipment_tasks (
          id, equipment_type, equipment_name, task_name, frequency,
          instructions, is_completed, last_completed_at, completed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const tasks = [
        {
          id: 'task_unox_preheat_am',
          equipment_type: 'OVEN',
          equipment_name: 'Unox Bakertop Mind.Maps Combi',
          task_name: 'Morning Viennoiserie Preheat Routine',
          frequency: 'DAILY_OPEN',
          instructions:
            'Select Program #01 (Croissant Bake). Preheat chamber to 175°C with 20% steam. Verify water filter pressure (2.5 bar).',
        },
        {
          id: 'task_unox_wash_pm',
          equipment_type: 'OVEN',
          equipment_name: 'Unox Bakertop Mind.Maps Combi',
          task_name: 'Evening Rotor.KLEAN Chemical Wash Cycle',
          frequency: 'DAILY_CLOSE',
          instructions:
            'Check Det&Rinse tank level. Insert wash rotor lock. Run Automated Long Wash cycle (55 min). Wipe door perimeter seal.',
        },
        {
          id: 'task_kb90_backflush_pm',
          equipment_type: 'ESPRESSO_MACHINE',
          equipment_name: 'La Marzocco KB90 (3-Group)',
          task_name: 'Evening Chemical Grouphead Backflush',
          frequency: 'DAILY_CLOSE',
          instructions:
            'Insert blind portafilter basket with 3g Cafiza backflush powder into Group 1, 2, and 3. Run auto-backflush cycle (5 x 10s). Purge steam wands with Rinza milk descaler.',
        },
        {
          id: 'task_e65s_hopper_weekly',
          equipment_type: 'GRINDER',
          equipment_name: 'Mahlkönig E65S GbW',
          task_name: 'Weekly Bean Hopper & Flapper Maintenance',
          frequency: 'WEEKLY',
          instructions:
            'Empty beans into vacuum container. Wash bean hopper with neutral detergent. Clear silicone declumper flap of ground chaff buildup. Verify load-cell calibration.',
        },
      ];

      for (const t of tasks) {
        insertTask.run(
          t.id,
          t.equipment_type,
          t.equipment_name,
          t.task_name,
          t.frequency,
          t.instructions,
          0,
          null,
          null,
        );
      }
    })();
    console.log('[CFR Equipment] Seeded standard commercial oven, espresso & grinder tasks.');
  }
}
