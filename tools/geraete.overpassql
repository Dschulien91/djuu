[out:csv(::lat,::lon,playground;true;"\t")][timeout:200];
area["name"="Hamburg"]["admin_level"="4"]->.hh;
node["playground"](area.hh);
out;
