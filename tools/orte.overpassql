[out:csv(::type,::id,::lat,::lon,name,amenity,shop,leisure,tourism,highway,healthcare,"healthcare:speciality",sport,access,indoor,changing_table,"changing_table:location",highchair,kids_area,dog,wheelchair,opening_hours,toilets,website,"contact:website",phone,"addr:street","addr:housenumber",fee,cuisine;true;"\t")][timeout:300];
area["name"="Hamburg"]["admin_level"="4"]->.hh;
(
  nwr["leisure"~"^(playground|indoor_play|water_park)$"](area.hh);
  nwr["amenity"~"^(cafe|restaurant|ice_cream|toilets|library|pharmacy|public_bath|fuel)$"](area.hh);
  nwr["shop"~"^(chemist|baby_goods|convenience|kiosk|supermarket|toys)$"](area.hh);
  nwr["highway"="elevator"](area.hh);
  nwr["tourism"~"^(zoo|museum)$"](area.hh);
  nwr["healthcare:speciality"~"paediatrics"](area.hh);
  nwr["leisure"="sports_centre"]["sport"~"swimming"](area.hh);
  nwr["changing_table"="yes"](area.hh);
);
out center;
