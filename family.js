/* Djuu family: members, shopping list (supermarket) and errands (Besorgungen).
   Loaded after app.js and uses its helpers (store, save, svg, esc, head, view, renderPanel, toast, uid).
   Everything stays on this device for now. The shapes are ready for the shared family on the server
   (db/supabase/schema.sql): every item knows who added it (member id) and when. */
'use strict'; // i18n-skip

// ---------- Members ----------
// ids in the server's format (15 lowercase letters and digits), so items need no renaming when the family is shared
function pbId() { const a = 'abcdefghijklmnopqrstuvwxyz0123456789', b = crypto.getRandomValues(new Uint8Array(15)); return Array.from(b, x => a[x % 36]).join(''); }
// the six person colours: Viola, Petrol, Rosa, Orange, Gelb, Nachtblau. Text on yellow is dark.
const MEMBER_COLORS = ['#6B4EE6', '#0E8F84', '#D6336C', '#CC6A00', '#FFD166', '#1F1B4D'];
const onColor = c => c === '#FFD166' ? '#1F1B4D' : '#FFFFFF';
const textOn = c => c === '#FFD166' ? '#8A6100' : c; // the colour as text on white
store.profile.adults = store.profile.adults || [];
for (const k of store.profile.kids) k.id = k.id || pbId();
for (const a of store.profile.adults) a.id = a.id || pbId();
save();
// everyone with their own colour (chosen or given automatically, see looks.js) and photo
function members() {
  const pr = store.profile;
  const list = pr.adults.map((a, i) => ({ id: a.id, name: a.name || `${tl('Erwachsene*r')} ${i + 1}`, kid: false, color: a.color, photo: a.photo || '' }))
    .concat(pr.kids.map((k, i) => ({ id: k.id, name: k.name || `${tl('Kind')} ${i + 1}`, kid: true, size: k.size, shoe: k.shoe, color: k.color, photo: k.photo || '' })));
  // people whose colour is not stored yet get a free one for display, the same on every phone
  const used = new Set(list.map(m => m.color).filter(c => MEMBER_COLORS.includes(c)));
  let n = 0;
  for (const m of list) if (!MEMBER_COLORS.includes(m.color)) { m.color = MEMBER_COLORS.find(c => !used.has(c)) || MEMBER_COLORS[n++ % MEMBER_COLORS.length]; used.add(m.color); }
  return list;
}
const memberById = id => members().find(m => m.id === id);
// who is using this device: chosen in "Wir", else the first adult
const meId = () => (memberById(store.profile.me) && store.profile.me) || store.profile.adults[0]?.id || null;
const byLine = id => { const m = id && memberById(id); return m ? `<span class="by" style="--c:var(--muted)">${esc(m.name)}</span>` : ''; }; // no person colours in the lists

// ---------- Shopping: supermarket ----------
// Categories in the order most German supermarkets put them; the app learns the order of your shop from how you tick items off.
// Third column: German words. A German word also finds compounds that end in it ("wein" finds "Rotwein").
// "a=b": a is another name for b, both count as the same thing on the list ("karotte=moehre"). "_" joins words that only mean this together.
// Fourth column: English words ("milk=milch"). They match whole words only and count as the same thing as their German word,
// so "Milk" and "Milch" sort into the same aisle and are found as duplicates of each other.
const SHOP_CATS = [
  ['obst', 'Obst & Gemüse',
    'apfel aepfel=apfel banane birne orange mandarine clementine zitrone limette traube trauben=traube weintrauben=traube erdbeere himbeere heidelbeere blaubeere=heidelbeere johannisbeere stachelbeere brombeere beere kiwi mango ananas melone wassermelone honigmelone pfirsich nektarine pflaume zwetschge kirsche aprikose grapefruit pomelo granatapfel physalis papaya litschi maracuja rhabarber avocado tomate kirschtomate cherrytomate=kirschtomate strauchtomate gurke salatgurke salat eisberg kopfsalat rucola feldsalat spinat babyspinat mangold brokkoli blumenkohl rosenkohl kohl weisskohl rotkohl wirsing gruenkohl spitzkohl kohlrabi moehre karotte=moehre moehrchen=moehre pastinake ruebe steckruebe kartoffel suesskartoffel zwiebel fruehlingszwiebel lauchzwiebel=fruehlingszwiebel schalotte knoblauch paprika spitzpaprika peperoni chilischote zucchini aubergine lauch porree=lauch sellerie staudensellerie fenchel radieschen rettich spargel pilze champignons pfifferlinge ingwer kraeuter petersilie basilikum schnittlauch dill koriander minze zitronengras rote_bete artischocke kuerbis hokkaido obst gemuese zuckerschoten gruene_bohnen buschbohnen sprossen',
    'apple=apfel banana=banane pear=birne orange mandarin=mandarine clementine tangerine=mandarine lemon=zitrone lime=limette grape=traube strawberry=erdbeere raspberry=himbeere blueberry=heidelbeere blackberry=brombeere berries=beere kiwi mango pineapple=ananas melon=melone watermelon=wassermelone peach=pfirsich nectarine=nektarine plum=pflaume cherry=kirsche apricot=aprikose grapefruit pomegranate=granatapfel papaya rhubarb=rhabarber avocado tomato=tomate cherry_tomatoes=kirschtomate cucumber=gurke lettuce=salat salad=salat rocket=rucola arugula=rucola spinach=spinat chard=mangold broccoli=brokkoli cauliflower=blumenkohl brussels_sprouts=rosenkohl cabbage=kohl red_cabbage=rotkohl kale=gruenkohl kohlrabi carrot=moehre parsnip=pastinake potato=kartoffel sweet_potato=suesskartoffel onion=zwiebel spring_onion=fruehlingszwiebel scallion=fruehlingszwiebel green_onion=fruehlingszwiebel shallot=schalotte garlic=knoblauch pepper=paprika bell_pepper=paprika chili_pepper=chilischote zucchini courgette=zucchini eggplant=aubergine aubergine leek=lauch celery=sellerie fennel=fenchel radish=radieschen asparagus=spargel mushroom=pilze ginger=ingwer herbs=kraeuter parsley=petersilie basil=basilikum chives=schnittlauch dill coriander=koriander cilantro=koriander mint=minze beetroot=rote_bete beet=rote_bete pumpkin=kuerbis squash=kuerbis fruit=obst vegetables=gemuese veggies=gemuese veg=gemuese green_beans=gruene_bohnen sugar_snap_peas=zuckerschoten sprouts=sprossen'],
  ['brot', 'Brot & Backwaren',
    'brot broetchen brotchen=broetchen semmel=broetchen schrippe=broetchen toast toastbrot vollkornbrot roggenbrot dinkelbrot sauerteigbrot pumpernickel baguette ciabatta focaccia croissant franzbroetchen laugenbrezel laugenbroetchen brezel=laugenbrezel kuchen torte muffin donut zimtschnecke rosinenbroetchen knaeckebrot zwieback wraps tortilla fladenbrot pita naan burgerbroetchen hotdogbroetchen aufbackbroetchen bagel waffeln',
    'bread=brot rolls=broetchen bread_rolls=broetchen buns=broetchen toast sliced_bread=toastbrot wholemeal_bread=vollkornbrot sourdough=sauerteigbrot baguette ciabatta croissant pretzel=laugenbrezel cake=kuchen muffin donut doughnut=donut cinnamon_roll=zimtschnecke crispbread=knaeckebrot rusks=zwieback wraps tortilla flatbread=fladenbrot pita naan burger_buns=burgerbroetchen hot_dog_buns=hotdogbroetchen bagel waffles=waffeln pancakes=pfannkuchen brownies'],
  ['kuehl', 'Milch, Käse & Eier',
    'milch vollmilch hafermilch haferdrink=hafermilch sojamilch mandelmilch laktosefrei joghurt jogurt=joghurt naturjoghurt griechischer_joghurt quark magerquark skyr sahne schlagsahne kochsahne schmand saure_sahne creme_fraiche butter margarine kaese gouda emmentaler bergkaese butterkaese edamer cheddar brie camembert mozzarella burrata feta hirtenkaese halloumi parmesan frischkaese huettenkaese reibekaese mascarpone ricotta eier ei=eier pudding milchreis kefir ayran buttermilch smoothie hefe frischhefe tofu tempeh hummus falafel veggie veggie_burger goetterspeise gnocchi tortellini ravioli frische_nudeln pizzateig blaetterteig hefeteig teig kraeuterbutter eiersalat kartoffelsalat nudelsalat fleischsalat milchschnitte fruchtzwerge',
    'milk=milch whole_milk=vollmilch oat_milk=hafermilch soy_milk=sojamilch almond_milk=mandelmilch yogurt=joghurt yoghurt=joghurt greek_yogurt=griechischer_joghurt quark cream=sahne whipping_cream=schlagsahne heavy_cream=sahne double_cream=sahne sour_cream=saure_sahne butter margarine cheese=kaese cheddar brie camembert mozzarella burrata feta halloumi parmesan cream_cheese=frischkaese cottage_cheese=huettenkaese grated_cheese=reibekaese mascarpone ricotta eggs=eier egg=eier pudding rice_pudding=milchreis kefir buttermilk smoothie yeast=hefe tofu tempeh hummus falafel gnocchi tortellini ravioli fresh_pasta=frische_nudeln pizza_dough=pizzateig puff_pastry=blaetterteig dough=teig coleslaw potato_salad=kartoffelsalat veggie_burger jelly_dessert=goetterspeise'],
  ['fleisch', 'Wurst, Fleisch & Fisch',
    'wurst salami schinken kochschinken aufschnitt leberwurst mettwurst teewurst wiener wuerstchen=wiener bratwurst chorizo mortadella speck bacon=speck hack hackfleisch rinderhack fleisch rind rindfleisch schwein schweinefleisch kassler braten filet gyros doener cevapcici frikadellen buletten=frikadellen haehnchen haehnchenbrust huhn haehnchenschenkel nuggets pute putenbrust ente gans lamm schnitzel steak gulasch lachs raeucherlachs fisch forelle dorsch kabeljau seelachs scholle hering matjes makrele garnelen krabben muscheln tintenfisch calamari',
    'sausage=wurst sausages=wiener hot_dogs=wiener salami ham=schinken cold_cuts=aufschnitt deli_meat=aufschnitt bacon=speck chorizo mince=hackfleisch minced_meat=hackfleisch ground_beef=rinderhack meat=fleisch beef=rindfleisch pork=schweinefleisch steak lamb=lamm chicken=haehnchen chicken_breast=haehnchenbrust chicken_thighs=haehnchenschenkel nuggets turkey=pute duck=ente schnitzel meatballs=frikadellen salmon=lachs smoked_salmon=raeucherlachs fish=fisch trout=forelle cod=kabeljau herring=hering mackerel=makrele shrimp=garnelen prawns=garnelen mussels=muscheln squid=tintenfisch calamari'],
  ['fruehstueck', 'Frühstück, Kaffee & Tee',
    'muesli musli=muesli granola=muesli knuspermuesli haferflocken porridge cornflakes cerealien marmelade konfituere=marmelade gelee honig ahornsirup agavendicksaft nutella nussnougatcreme schokocreme=nussnougatcreme aufstrich erdnussbutter kaffee kaffeebohnen espresso cappuccino kaffeepads kapseln kaffeefilter kakao trinkschokolade tee pfefferminztee kamillentee fruechtetee kraeutertee gruener_tee schwarzer_tee rooibos',
    'cereal=cerealien cereals=cerealien muesli granola=muesli oats=haferflocken porridge_oats=haferflocken porridge cornflakes jam=marmelade marmalade=marmelade jelly=gelee honey=honig maple_syrup=ahornsirup agave=agavendicksaft nutella chocolate_spread=nussnougatcreme spread=aufstrich peanut_butter=erdnussbutter coffee=kaffee coffee_beans=kaffeebohnen espresso cappuccino coffee_pods=kaffeepads capsules=kapseln coffee_filters=kaffeefilter cocoa=kakao hot_chocolate=trinkschokolade tea=tee green_tea=gruener_tee herbal_tea=kraeutertee'],
  ['vorrat', 'Nudeln, Reis & Vorrat',
    'nudeln pasta=nudeln spaghetti penne fusilli farfalle tagliatelle lasagne lasagneplatten makkaroni spaetzle reis basmatireis couscous bulgur quinoa polenta griess hirse linsen kichererbsen bohnen kidneybohnen weisse_bohnen mais mehl dinkelmehl zucker brauner_zucker puderzucker backpulver natron vanillezucker vanille speisestaerke staerke gelatine semmelbroesel paniermehl=semmelbroesel salz pfeffer gewuerze paprikapulver curry zimt muskat oregano thymian rosmarin kreuzkuemmel chili chiliflocken oel olivenoel rapsoel sonnenblumenoel kokosoel essig balsamico ketchup senf mayonnaise mayo=mayonnaise remoulade pesto tomatensosse passata passierte_tomaten=passata tomatenmark dosentomaten bruehe gemuesebruehe bruehwuerfel fond suppe tuetensuppe eintopf fertiggericht konserven dose dosen thunfisch sardinen nuesse mandeln haselnuesse walnuesse cashew cashews=cashew erdnuesse pistazien rosinen datteln feigen trockenobst cranberries kokosraspeln sosse sauce=sosse sojasosse sriracha tabasco grillsosse bbq dressing kokosmilch apfelmus kompott sauerkraut gewuerzgurken kapern oliven antipasti',
    'pasta=nudeln noodles=nudeln spaghetti penne fusilli macaroni=makkaroni lasagne lasagna=lasagne rice=reis basmati=basmatireis couscous bulgur quinoa polenta semolina=griess lentils=linsen chickpeas=kichererbsen beans=bohnen kidney_beans=kidneybohnen baked_beans=bohnen corn=mais sweetcorn=mais flour=mehl sugar=zucker brown_sugar=brauner_zucker icing_sugar=puderzucker powdered_sugar=puderzucker baking_powder=backpulver baking_soda=natron vanilla=vanille vanilla_sugar=vanillezucker cornstarch=speisestaerke cornflour=speisestaerke gelatin=gelatine breadcrumbs=semmelbroesel salt=salz black_pepper=pfeffer spices=gewuerze paprika_powder=paprikapulver curry_powder=curry curry cinnamon=zimt nutmeg=muskat oregano thyme=thymian rosemary=rosmarin cumin=kreuzkuemmel chili chili_flakes=chiliflocken oil=oel olive_oil=olivenoel rapeseed_oil=rapsoel sunflower_oil=sonnenblumenoel coconut_oil=kokosoel vinegar=essig balsamic=balsamico balsamic_vinegar=balsamico ketchup mustard=senf mayonnaise mayo=mayonnaise pesto tomato_sauce=tomatensosse pasta_sauce=tomatensosse passata canned_tomatoes=dosentomaten tinned_tomatoes=dosentomaten chopped_tomatoes=dosentomaten tomato_paste=tomatenmark tomato_puree=tomatenmark stock=bruehe broth=bruehe stock_cubes=bruehwuerfel bouillon=bruehe soup=suppe ready_meal=fertiggericht tuna=thunfisch sardines=sardinen nuts=nuesse almonds=mandeln hazelnuts=haselnuesse walnuts=walnuesse cashews=cashew peanuts=erdnuesse pistachios=pistazien raisins=rosinen dates=datteln figs=feigen dried_fruit=trockenobst cranberries desiccated_coconut=kokosraspeln sauce=sosse soy_sauce=sojasosse hot_sauce=sriracha bbq_sauce=grillsosse dressing coconut_milk=kokosmilch apple_sauce=apfelmus applesauce=apfelmus sauerkraut pickles=gewuerzgurken gherkins=gewuerzgurken capers=kapern olives=oliven'],
  ['suess', 'Süßes & Knabbern',
    'schokolade schoki=schokolade kekse plaetzchen butterkekse gummibaerchen fruchtgummi weingummi lakritz bonbons lutscher lolli=lutscher marshmallows chips salzstangen flips erdnussflips cracker popcorn riegel muesliriegel schokoriegel kaugummi suessigkeiten pralinen lebkuchen spekulatius studentenfutter brause brausepulver nachtisch',
    'chocolate=schokolade cookies=kekse biscuits=kekse gummy_bears=gummibaerchen gummies=fruchtgummi candy=suessigkeiten sweets=suessigkeiten liquorice=lakritz licorice=lakritz lollipop=lutscher marshmallows crisps=chips chips pretzels=salzstangen crackers=cracker popcorn cereal_bar=muesliriegel granola_bar=muesliriegel chocolate_bar=schokoriegel chewing_gum=kaugummi gum=kaugummi snacks trail_mix=studentenfutter dessert=nachtisch'],
  ['getraenke', 'Getränke',
    'wasser mineralwasser sprudel stilles_wasser saft apfelsaft orangensaft multivitaminsaft traubensaft schorle apfelschorle limo limonade cola fanta sprite spezi tonic tonicwasser eistee mate kombucha energydrink drink sirup bier alkoholfrei radler alster malzbier pils wein rotwein weisswein rosewein sekt prosecco cremant champagner wodka vodka=wodka gin rum whisky whiskey=whisky likoer eierlikoer aperol campari schnaps spirituosen cider getraenke',
    'water=wasser mineral_water=mineralwasser sparkling_water=sprudel still_water=stilles_wasser juice=saft apple_juice=apfelsaft orange_juice=orangensaft lemonade=limonade soda=limonade coke=cola cola tonic ginger_ale iced_tea=eistee ice_tea=eistee kombucha energy_drink=energydrink drink drinks=getraenke syrup=sirup cordial=sirup beer=bier lager=bier alcohol_free=alkoholfrei wine=wein red_wine=rotwein white_wine=weisswein rose=rosewein sparkling_wine=sekt prosecco champagne=champagner vodka=wodka gin rum whisky whiskey=whisky liqueur=likoer cider'],
  ['baby', 'Baby & Drogerie',
    'windeln pampers=windeln feuchttuecher babybrei brei glaeschen quetschie quetschies=quetschie milchpulver folgemilch babymilch prenahrung nahrung schnuller babyoel babyshampoo wundcreme wundschutzcreme zahnpasta zahncreme=zahnpasta zahnbuerste zahnseide mundspuelung shampoo spuelung haarkur duschgel seife handseife fluessigseife deo deodorant=deo creme bodylotion lotion gesichtscreme serum sonnencreme sonnenschutz toilettenpapier klopapier=toilettenpapier taschentuecher waschlappen pflaster tampons binden slipeinlagen rasierer rasierklingen rasierschaum wattepads wattestaebchen abschminktuecher make_up mascara nagellack haargummis haarspray haargel kontaktlinsenmittel kondome vitamine tabletten ibuprofen paracetamol aspirin nasenspray hustensaft hustenbonbons fiebersaft fieberthermometer medikamente',
    'diapers=windeln nappies=windeln wipes=feuchttuecher baby_wipes=feuchttuecher baby_food=babybrei formula=milchpulver baby_formula=milchpulver pacifier=schnuller dummy=schnuller toothpaste=zahnpasta toothbrush=zahnbuerste floss=zahnseide mouthwash=mundspuelung shampoo conditioner=spuelung shower_gel=duschgel body_wash=duschgel soap=seife hand_soap=handseife deodorant=deo deo moisturizer=creme lotion=bodylotion body_lotion=bodylotion face_cream=gesichtscreme sunscreen=sonnencreme sun_cream=sonnencreme toilet_paper=toilettenpapier toilet_roll=toilettenpapier loo_roll=toilettenpapier tissues=taschentuecher plasters=pflaster band_aids=pflaster bandaids=pflaster tampons pads=binden razor=rasierer razor_blades=rasierklingen shaving_foam=rasierschaum cotton_pads=wattepads cotton_buds=wattestaebchen q_tips=wattestaebchen makeup=make_up mascara nail_polish=nagellack hair_ties=haargummis hairspray=haarspray contact_lens_solution=kontaktlinsenmittel condoms=kondome vitamins=vitamine painkillers=tabletten pills=tabletten ibuprofen paracetamol aspirin nasal_spray=nasenspray cough_syrup=hustensaft cough_drops=hustenbonbons thermometer=fieberthermometer medicine=medikamente'],
  ['haushalt', 'Haushalt & Putzen',
    'spuelmittel spuelmaschinentabs tabs spuelmaschinensalz klarspueler waschmittel weichspueler fleckenentferner muellbeutel muelltueten=muellbeutel alufolie frischhaltefolie backpapier kuechenrolle schwamm schwaemme=schwamm putzmittel reiniger glasreiniger allzweckreiniger entkalker lappen staubsaugerbeutel batterien gluehbirne leuchtmittel kerzen teelichter servietten gefrierbeutel butterbrotpapier streichhoelzer feuerzeug grillkohle anzuender geschenkpapier klebeband tesafilm',
    'dish_soap=spuelmittel washing_up_liquid=spuelmittel dishwashing_liquid=spuelmittel dishwasher_tabs=spuelmaschinentabs dishwasher_tablets=spuelmaschinentabs dishwasher_salt=spuelmaschinensalz rinse_aid=klarspueler detergent=waschmittel laundry_detergent=waschmittel washing_powder=waschmittel fabric_softener=weichspueler softener=weichspueler stain_remover=fleckenentferner bin_bags=muellbeutel trash_bags=muellbeutel garbage_bags=muellbeutel rubbish_bags=muellbeutel bin_liners=muellbeutel foil=alufolie aluminium_foil=alufolie aluminum_foil=alufolie tin_foil=alufolie cling_film=frischhaltefolie plastic_wrap=frischhaltefolie baking_paper=backpapier parchment_paper=backpapier paper_towels=kuechenrolle kitchen_roll=kuechenrolle kitchen_towels=kuechenrolle sponge=schwamm cleaner=reiniger cleaning_spray=putzmittel glass_cleaner=glasreiniger bleach=putzmittel descaler=entkalker cloths=lappen vacuum_bags=staubsaugerbeutel batteries=batterien light_bulbs=gluehbirne bulbs=gluehbirne candles=kerzen tealights=teelichter napkins=servietten freezer_bags=gefrierbeutel sandwich_bags=gefrierbeutel matches=streichhoelzer lighter=feuerzeug charcoal=grillkohle wrapping_paper=geschenkpapier tape=klebeband'],
  ['tier', 'Tierbedarf',
    'hundefutter katzenfutter katzenstreu leckerli tierfutter nassfutter trockenfutter vogelfutter fischfutter futter',
    'dog_food=hundefutter cat_food=katzenfutter cat_litter=katzenstreu litter=katzenstreu pet_food=tierfutter treats=leckerli bird_seed=vogelfutter'],
  ['tiefkuehl', 'Tiefkühl',
    'tk tiefkuehl pizza tiefkuehlpizza eis eiscreme=eis speiseeis=eis wassereis pommes kroketten rahmspinat erbsen fischstaebchen tiefkuehlgemuese beerenmischung',
    'ice_cream=eis ice_lolly=wassereis popsicle=wassereis pizza fries=pommes french_fries=pommes peas=erbsen fish_fingers=fischstaebchen fish_sticks=fischstaebchen'],
  ['sonst', 'Sonstiges', '', ''],
];
const SHOP_CAT = Object.fromEntries(SHOP_CATS.map(([id, label]) => [id, label]));
// German plural and case endings off, so "Bananen" finds "banane" and "Äpfel" finds "apfel"
const stem = w => w.length > 4 ? w.replace(/(en|n|e|s)$/, '') : w;
// English plural endings: "tomatoes", "cherries", "cookies" find "tomato", "cherry", "cookie"
const enForms = w => [...new Set([w, w.replace(/s$/, ''), w.replace(/es$/, ''), w.replace(/ies$/, 'y'), w.replace(/ies$/, 'ie')])].filter(x => x.length >= 2);
const shopNorm = s => norm(s).replace(/[^a-z0-9 _-]+/g, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
const SHOP_WORDS = [];        // German words: [word, stemmed, category], longest first
const SHOP_PHRASES = [];      // words that only mean this together: [' rote bete ', category], longest first
const SHOP_EXACT = new Map(); // English word forms -> category
const SHOP_SYN = new Map();   // other name -> the German name it means
function shopEntry(entry, id, english) {
  const [a, b] = entry.split('='), w = shopNorm(a), target = b ? shopNorm(b) : '';
  if (w.includes(' ')) SHOP_PHRASES.push([` ${w} `, id]);
  else if (!english) SHOP_WORDS.push([w, stem(w), id]);
  if (english) for (const f of (w.includes(' ') ? [w, w.replace(/s$/, '')] : enForms(w))) { if (!SHOP_EXACT.has(f)) SHOP_EXACT.set(f, id); if (target && !SHOP_SYN.has(f)) SHOP_SYN.set(f, target); }
  else if (target) { SHOP_SYN.set(w, target); SHOP_SYN.set(stem(w), target); } // "Karotten" finds "karotte" too
}
for (const [id, , de, en] of SHOP_CATS) {
  for (const e of de.split(' ').filter(Boolean)) shopEntry(e, id, false);
  for (const e of (en || '').split(' ').filter(Boolean)) shopEntry(e, id, true);
}
SHOP_WORDS.sort((a, b) => b[0].length - a[0].length); // longest match first: "hafermilch" before "milch"
SHOP_PHRASES.sort((a, b) => b[0].length - a[0].length);

store.shop = Object.assign({ items: [], history: {}, learned: {}, rank: {}, trips: 0, seq: [] }, store.shop || {});
store.errands = store.errands || [];
const SH = { pending: null, menu: null, undo: null, editing: null }; // screen state, not saved

// "2 Milch", "Milch 2x", "500 g Hack" -> quantity and name
function parseItem(text) {
  const t = text.trim().replace(/\s+/g, ' ');
  let m = t.match(/^(\d+(?:[.,]\d+)?\s*(?:x|stk\.?|stück|g|gr|kg|l|ml|pck\.?|packungen?|dosen?|flaschen?|becher|beutel|bund|netz|kisten?|pcs|packs?|bottles?|cans?|jars?|bags?|box(?:es)?|lbs?|oz)?)\s+(.+)$/i);
  if (m) return { qty: m[1].replace(/\s+/g, ' '), name: m[2] };
  m = t.match(/^(.+?)\s+(\d+(?:[.,]\d+)?\s*(?:x|stk\.?|g|kg|l|ml)?)$/i);
  if (m && !/(gr\.?|größe|groesse|nr\.?|gr)$/i.test(m[1])) return { qty: m[2], name: m[1] }; // "Windeln Gr. 4" keeps its size
  return { qty: '', name: t };
}
// same thing, different spelling: case, umlauts, plural endings, English or German ("Milk" = "Milch", "Karotten" = "Möhren")
const baseKey = n => { n = n.replace(/[^a-z0-9]+/g, ''); return n.length > 4 ? n.replace(/(en|n|e|s)$/, '') : n; };
function synonymOf(name) {
  const n = shopNorm(name);
  for (const f of [n, ...enForms(n), stem(n)]) if (SHOP_SYN.has(f)) return SHOP_SYN.get(f);
  return null;
}
const itemKey = name => baseKey(synonymOf(name) || norm(name));
// which aisle: frozen first, then words that belong together, then English words (the last one names the thing),
// then German words, which also find compounds ("Rotwein" ends in "wein")
function shopCat(name) {
  const k = itemKey(name);
  if (store.shop.learned[k]) return store.shop.learned[k];
  const n = shopNorm(name), padded = ` ${n} `, ws = n.split(' ').filter(Boolean);
  if (/ (tk|tiefkuehl|tiefgekuehlt|gefroren|frozen) /.test(padded)) return 'tiefkuehl';
  for (const [p, id] of SHOP_PHRASES) if (padded.includes(p)) return id;
  for (let i = ws.length - 1; i >= 0; i--) for (const f of enForms(ws[i])) if (SHOP_EXACT.has(f)) return SHOP_EXACT.get(f);
  for (const [w, wst, id] of SHOP_WORDS) {
    if (ws.some(x => { const xs = stem(x); return x === w || xs === wst || (w.length >= 3 && (x.endsWith(w) || xs.endsWith(wst))); })) return id;
  }
  return 'sonst';
}
// learned shop order: average position of each category in past trips, default order until there are two trips
function catOrder() {
  const base = Object.fromEntries(SHOP_CATS.map(([id], i) => [id, i]));
  if (store.shop.trips < 2) return base;
  const r = store.shop.rank, out = {};
  for (const id in base) out[id] = r[id] != null ? r[id] : base[id] / SHOP_CATS.length;
  out.sonst = 99;
  return out;
}
const openItems = () => store.shop.items.filter(i => !i.done && !i.later);
function findDuplicate(name) {
  const k = itemKey(name);
  return openItems().concat(store.shop.items.filter(i => i.later)).find(i => itemKey(i.name) === k || (k.length >= 5 && typoDist(itemKey(i.name), k, 1) <= 1));
}
function addShopItem(text, force = false) {
  const { qty, name } = parseItem(text);
  if (!name) return;
  const dup = !force && findDuplicate(name);
  if (dup) { SH.pending = { text, qty, name, dup: dup.id }; renderPanel(); return; }
  store.shop.items.push({ id: pbId(), name, qty, cat: shopCat(name), by: meId(), at: Date.now(), done: false, later: false });
  SH.pending = null; save(); renderPanel();
  setTimeout(() => $('#shIn')?.focus(), 30);
}
// "Menge erhöhen": numbers add up, everything else is listed
function raiseQty(item, qty) {
  const a = parseFloat((item.qty || '1').replace(',', '.')), b = parseFloat((qty || '1').replace(',', '.'));
  const unitA = (item.qty || '').replace(/[\d.,\s]/g, ''), unitB = (qty || '').replace(/[\d.,\s]/g, '');
  item.qty = !isNaN(a) && !isNaN(b) && unitA === unitB ? `${String(a + b).replace('.', ',')}${unitA ? ' ' + unitA : ''}` : [item.qty || '1', qty || '1'].join(' + ');
  item.later = false;
}
function finishTrip() {
  const s = store.shop, done = s.items.filter(i => i.done);
  if (!done.length) return;
  // learn the shop: position of each category in the order things went into the trolley
  const seen = [];
  for (const c of s.seq) if (!seen.includes(c)) seen.push(c);
  seen.forEach((c, i) => { const pos = i / Math.max(1, seen.length - 1); s.rank[c] = s.rank[c] == null ? pos : s.rank[c] * .6 + pos * .4; });
  for (const i of done) { const h = s.history[itemKey(i.name)] || { name: i.name, cat: i.cat, n: 0 }; h.n++; h.last = Date.now(); h.name = i.name; h.cat = i.cat; s.history[itemKey(i.name)] = h; }
  s.items = s.items.filter(i => !i.done).map(i => ({ ...i, later: false })); // "Nächstes Mal" comes back
  s.trips++; s.seq = [];
  save(); toast(`${tl('Einkauf fertig:')} ${done.length} ${done.length === 1 ? tl('Sache') : tl('Sachen')} erledigt.`);
}
function shopHtml() {
  const s = store.shop, order = catOrder(), open = openItems();
  const groups = {};
  for (const i of open) (groups[i.cat] || (groups[i.cat] = [])).push(i);
  const cats = Object.keys(groups).sort((a, b) => order[a] - order[b]);
  const done = s.items.filter(i => i.done), later = s.items.filter(i => i.later && !i.done);
  const onList = new Set(s.items.map(i => itemKey(i.name)));
  const often = Object.entries(s.history).filter(([k]) => !onList.has(k)).sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last).slice(0, 10);
  const row = i => `<li class="shrow${i.done ? ' done' : ''}">
      <button type="button" class="shcheck" data-shtoggle="${i.id}" aria-label="${i.done ? tl('Zurück auf die Liste') : tl('Abhaken')}">${i.done ? svg('check') : ''}</button>
      <button type="button" class="shname" data-shtoggle="${i.id}">${i.qty ? `<b>${esc(i.qty)}</b> ` : ''}${esc(i.name)}${byLine(i.by)}</button>
      ${i.done ? '' : `<button type="button" class="round sm" data-shmenu="${i.id}" aria-label="${tl('Mehr')}">⋯</button>`}</li>
      ${SH.menu === i.id ? `<li class="shmenu"><button type="button" class="chip" data-shlater="${i.id}">${tl('Nächstes Mal')}</button><button type="button" class="chip" data-shdel="${i.id}">${tl('Löschen')}</button>
        <span class="muted">${tl('Gang:')}</span>${SHOP_CATS.map(([id, l]) => `<button type="button" class="chip${i.cat === id ? ' on' : ''}" data-shcat="${i.id}|${id}">${esc(tl(l))}</button>`).join('')}</li>` : ''}`;
  const p = SH.pending, pd = p && s.items.find(i => i.id === p.dup);
  return `<form class="shadd" id="shForm"><input id="shIn" autocomplete="off" placeholder="${tl('Was fehlt? z. B. 2 Milch')}" maxlength="60" aria-label="${tl('Neuer Eintrag')}"><button type="submit" class="btn primary" aria-label="${tl('Hinzufügen')}">${svg('plus')}</button></form>
    ${p && pd ? `<div class="dupcard"><b>„${esc(pd.name)}${tl('“ steht schon drauf')}${pd.later ? tl(' (für nächstes Mal)') : ''}${pd.qty ? ', ' + esc(pd.qty) : ''}${memberById(pd.by) ? `, von ${esc(memberById(pd.by).name)}` : ''}.</b>
      <div class="fgrid"><button type="button" class="chip on" data-shraise="1">${tl('Menge erhöhen')}</button><button type="button" class="chip" data-shforce="1">${tl('Trotzdem hinzufügen')}</button><button type="button" class="chip" data-shcancel="1">${tl('Abbrechen')}</button></div></div>` : ''}
    ${often.length ? `<div class="row shoften">${often.map(([k, h]) => `<button type="button" class="chip" data-shagain="${esc(k)}">${svg('plus')}${esc(h.name)}</button>`).join('')}</div>` : ''}
    ${open.length ? cats.map(c => `<h4 class="shcat">${esc(tl(SHOP_CAT[c]))}</h4><ol class="shlist">${groups[c].sort((a, b) => a.at - b.at).map(row).join('')}</ol>`).join('')
      : `<div class="empty"><b>${done.length ? tl('Alles im Wagen.') : tl('Die Liste ist leer.')}</b>${done.length ? tl('Tippe auf „Einkauf fertig“, wenn ihr durch seid.') : tl('Was fehlt, sortiert Djuu nach den Gängen im Supermarkt.')}</div>`}
    ${done.length ? `<h4 class="shcat">${tl('Im Wagen (')}${done.length})</h4><ol class="shlist">${done.map(row).join('')}</ol>` : ''}
    ${later.length ? `<details class="fold"><summary>${tl('Nächstes Mal (')}${later.length})</summary><ol class="shlist">${later.map(i => `<li class="shrow"><span class="shname">${i.qty ? `<b>${esc(i.qty)}</b> ` : ''}${esc(i.name)}${byLine(i.by)}</span><button type="button" class="chip" data-shnow="${i.id}">${tl('Jetzt')}</button></li>`).join('')}</ol>
      <p class="note">${tl('Kommt nach „Einkauf fertig“ automatisch wieder auf die Liste.')}</p></details>` : ''}
    ${s.items.length ? `<div class="sticky-bar"><button type="button" class="btn" data-shclear="1">${tl('Liste leeren')}</button><button type="button" class="btn big primary" data-shfinish="1"${done.length ? '' : ' disabled'}>${tl('Einkauf fertig')}</button></div>` : ''}
    <p class="note">${store.shop.trips >= 2 ? tl('Die Reihenfolge der Gänge lernt Djuu aus euren letzten Einkäufen.') : tl('Sortiert wie in den meisten Supermärkten. Nach zwei Einkäufen passt Djuu die Reihenfolge an euren Laden an.')}</p>`;
}

// ---------- Errands (Besorgungen): clothes, furniture, presents ----------
const ERRAND_STATES = [['idee', tl('Idee')], ['ja', tl('Kaufen wir')], ['gekauft', tl('Gekauft')]];
const cleanUrl = u => { try { const x = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u); return /^https?:$/.test(x.protocol) && x.hostname.includes('.') ? x.href : null; } catch (e) { return null; } };
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
// a readable title from a shop link: last words of the path ("kinderbett-90x200" -> "Kinderbett 90x200"), else the shop's name
function titleFromUrl(u) {
  try {
    const parts = decodeURIComponent(new URL(u).pathname).split('/').filter(x => /[a-zäöüß]{3}/i.test(x) && !/^(p|dp|product|produkt|artikel|item|de|shop)$/i.test(x));
    const t = (parts.pop() || '').replace(/\.[a-z]{2,5}$/i, '').replace(/[-_+]+/g, ' ').replace(/\b[0-9a-f]{8,}\b|\b\d{5,}\b/gi, '').replace(/\s+/g, ' ').trim();
    return t.length >= 3 ? t.charAt(0).toUpperCase() + t.slice(1, 70) : hostOf(u);
  } catch (e) { return hostOf(u); }
}
function addErrand(text) {
  const t = text.trim(); if (!t) return;
  const url = /^(https?:\/\/|www\.)\S+$/i.test(t) ? cleanUrl(t) : null;
  const e = { id: pbId(), title: url ? titleFromUrl(url) : t, link: url || '', for: '', note: '', price: '', state: 'idee', by: meId(), at: Date.now() };
  store.errands.unshift(e); SH.editing = url ? e.id : null; save(); renderPanel();
}
function errandHtml() {
  const ms = members(), list = store.errands, open = list.filter(e => e.state !== 'gekauft'), bought = list.filter(e => e.state === 'gekauft');
  const groups = [['', tl('Für alle')]].concat(ms.map(m => [m.id, tl('Für ') + m.name])).map(([id, l]) => [l, open.filter(e => (e.for || '') === id || (id === '' && !memberById(e.for)))]).filter(([, l]) => l.length);
  const card = e => {
    const m = memberById(e.for), size = m && m.kid && (m.size || m.shoe) ? [m.size && tl('Gr. ') + m.size, m.shoe && tl('Schuhe ') + m.shoe].filter(Boolean).join(' · ') : '';
    return `<li class="ercard${e.state === 'gekauft' ? ' done' : ''}">
      <div class="erhead"><button type="button" class="shcheck" data-erbought="${e.id}" aria-label="${e.state === 'gekauft' ? tl('Doch nicht gekauft') : tl('Gekauft')}">${e.state === 'gekauft' ? svg('check') : ''}</button>
        <div class="ertitle"><b>${esc(e.title)}</b>
          <span class="ermeta">${e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener nofollow">${esc(hostOf(e.link))}</a>` : ''}${e.price ? `<span>${esc(e.price)}</span>` : ''}${size ? `<span>${esc(size)}</span>` : ''}${byLine(e.by)}</span>
          ${e.note ? `<span class="muted">${esc(e.note)}</span>` : ''}</div>
        <button type="button" class="round sm" data-eredit="${e.id}" aria-label="${tl('Bearbeiten')}">${svg('edit')}</button></div>
      ${e.state !== 'gekauft' ? `<div class="erstates">${ERRAND_STATES.slice(0, 2).map(([id, l]) => `<button type="button" class="chip${e.state === id ? ' on' : ''}" data-erstate="${e.id}|${id}">${l}</button>`).join('')}</div>` : ''}
      ${SH.editing === e.id ? `<div class="eredit">
        <input data-erf="${e.id}|title" value="${esc(e.title)}" maxlength="80" aria-label="${tl('Was')}">
        <input data-erf="${e.id}|link" value="${esc(e.link)}" placeholder="${tl('Link (optional)')}" inputmode="url" aria-label="${tl('Link')}">
        <select data-erf="${e.id}|for" aria-label="${tl('Für wen')}"><option value="">${tl('Für alle')}</option>${ms.map(x => `<option value="${x.id}"${e.for === x.id ? ' selected' : ''}>${tl('Für')} ${esc(x.name)}</option>`).join('')}</select>
        <input data-erf="${e.id}|price" value="${esc(e.price)}" placeholder="${tl('Preis (optional)')}" maxlength="20" aria-label="${tl('Preis')}">
        <input data-erf="${e.id}|note" value="${esc(e.note)}" placeholder="${tl('Notiz, z. B. Farbe, Laden')}" maxlength="140" aria-label="${tl('Notiz')}">
        <div class="fgrid"><button type="button" class="chip on" data-eredit="${e.id}">${tl('Fertig')}</button><button type="button" class="chip" data-erdel="${e.id}">${tl('Löschen')}</button></div></div>` : ''}</li>`;
  };
  return `<form class="shadd" id="erForm"><input id="erIn" autocomplete="off" placeholder="${tl('Was brauchen wir? Oder Link einfügen')}" maxlength="300" aria-label="${tl('Neue Besorgung')}"><button type="submit" class="btn primary" aria-label="${tl('Hinzufügen')}">${svg('plus')}</button></form>
    ${groups.length ? groups.map(([l, items]) => `<h4 class="shcat">${esc(l)}</h4><ol class="erlist">${items.map(card).join('')}</ol>`).join('')
      : `<div class="empty"><b>${tl('Noch nichts geplant.')}</b>${tl('Für alles außer dem Wocheneinkauf: Kinderkleidung, Möbel, Geschenke. Ein Link zum Shop passt auch.')}</div>`}
    ${bought.length ? `<details class="fold"><summary>${tl('Gekauft (')}${bought.length})</summary><ol class="erlist">${bought.map(card).join('')}</ol></details>` : ''}`;
}

// ---------- Interaction ----------
function shopItem(id) { return store.shop.items.find(i => i.id === id); }
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset, s = store.shop;
  if (d.shtoggle) { const i = shopItem(d.shtoggle); i.done = !i.done; if (i.done) { i.doneBy = meId(); s.seq.push(i.cat); } SH.menu = null; save(); renderPanel(); }
  else if (d.shmenu) { SH.menu = SH.menu === d.shmenu ? null : d.shmenu; renderPanel(); }
  else if (d.shlater) { shopItem(d.shlater).later = true; SH.menu = null; save(); renderPanel(); toast('Kommt beim nächsten Einkauf wieder.'); }
  else if (d.shnow) { shopItem(d.shnow).later = false; save(); renderPanel(); }
  else if (d.shdel) { s.items = s.items.filter(i => i.id !== d.shdel); SH.menu = null; save(); renderPanel(); }
  else if (d.shcat) { const [id, c] = d.shcat.split('|'), i = shopItem(id); i.cat = c; s.learned[itemKey(i.name)] = c; SH.menu = null; save(); renderPanel(); }
  else if (d.shraise) { const p = SH.pending, i = shopItem(p.dup); raiseQty(i, p.qty); SH.pending = null; save(); renderPanel(); }
  else if (d.shforce) { const p = SH.pending; SH.pending = null; addShopItem(p.text, true); }
  else if (d.shcancel) { SH.pending = null; renderPanel(); }
  else if (d.shagain) { const h = s.history[d.shagain]; addShopItem(h.name); }
  else if (d.shfinish) { finishTrip(); renderPanel(); }
  else if (d.shclear) {
    // everything on the list goes, "Nächstes Mal" stays and becomes the new list; one tap brings it all back
    const before = JSON.parse(JSON.stringify(s.items));
    s.items = s.items.filter(i => i.later && !i.done).map(i => ({ ...i, later: false })); save(); renderPanel();
    SH.undo = before; toastAction(tl('Liste geleert.'), tl('Rückgängig'), () => { s.items = SH.undo; SH.undo = null; save(); renderPanel(); });
  }
  else if (d.erbought) { const x = store.errands.find(r => r.id === d.erbought); x.state = x.state === 'gekauft' ? 'ja' : 'gekauft'; save(); renderPanel(); }
  else if (d.erstate) { const [id, st] = d.erstate.split('|'); store.errands.find(r => r.id === id).state = st; save(); renderPanel(); }
  else if (d.eredit) { SH.editing = SH.editing === d.eredit ? null : d.eredit; renderPanel(); }
  else if (d.erdel) { store.errands = store.errands.filter(r => r.id !== d.erdel); SH.editing = null; save(); renderPanel(); }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'shForm') { e.preventDefault(); const v = $('#shIn').value; if (v.trim()) addShopItem(v); }
  if (e.target.id === 'erForm') { e.preventDefault(); const v = $('#erIn').value; if (v.trim()) addErrand(v); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.adult != null) { store.profile.adults[+el.dataset.adult][el.dataset.k] = el.value.trim(); save(); }
  if (el.dataset.erf) {
    const [id, k] = el.dataset.erf.split('|'), x = store.errands.find(r => r.id === id);
    if (k === 'link') { const u = el.value.trim() ? cleanUrl(el.value.trim()) : ''; if (u === null) return toast('Der Link sieht nicht richtig aus.'); x.link = u; }
    else x[k] = el.value.trim();
    save();
    if (k === 'for') renderPanel();
  }
});
// toast with one action button (undo)
function toastAction(msg, label, fn) {
  const t = $('#toast');
  t.innerHTML = `${esc(msg)} <button type="button" class="toastbtn">${esc(label)}</button>`;
  t.hidden = false; clearTimeout(toast.t);
  t.querySelector('button').onclick = () => { fn(); t.hidden = true; };
  toast.t = setTimeout(() => t.hidden = true, 6000);
}

// items that landed in "Sonstiges" before the vocabulary knew them get their aisle now; aisles you chose yourself stay.
// Also runs when the family's list comes from the server (sync.js), so every phone shows them in the right aisle.
function resortSonst() {
  let moved = 0;
  for (const i of store.shop.items) if (i.cat === 'sonst' && !store.shop.learned[itemKey(i.name)]) { const c = shopCat(i.name); if (c !== 'sonst') { i.cat = c; moved++; } }
  for (const h of Object.values(store.shop.history)) if (h.cat === 'sonst') h.cat = shopCat(h.name);
  return moved;
}
if (resortSonst()) save();
