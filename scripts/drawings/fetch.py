import json, sys, time, urllib.parse, urllib.request, pathlib
UA={"User-Agent":"GoingConcernLab-research/1.0 (image licensing research)"}
out=pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
titles=[l.strip() for l in open(sys.argv[2]) if l.strip()]
width=sys.argv[3] if len(sys.argv)>3 else "1600"
rows=[]
def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r: return r.read()
        except Exception as e:
            time.sleep(3*(k+1)); err=e
    raise err
for i,t in enumerate(titles,1):
    n=f"c{i:02d}"
    q=urllib.parse.urlencode({"action":"query","format":"json","titles":t,"prop":"imageinfo","iiprop":"url|extmetadata","iiurlwidth":width,"iiextmetadatafilter":"LicenseShortName|Artist|DateTimeOriginal"})
    try:
        d=json.loads(get("https://commons.wikimedia.org/w/api.php?"+q))
        ii=next(iter(d["query"]["pages"].values()))["imageinfo"][0]
        (out/f"{n}.jpg").write_bytes(get(ii["thumburl"]))
        rows.append([n, ii["extmetadata"].get("LicenseShortName",{}).get("value",""), ii["descriptionurl"], t[5:]])
        print(n, "ok", rows[-1][1])
    except Exception as e:
        print(n, "FAIL", e)
    time.sleep(1.5)
with open(out/"sources.tsv","w") as f:
    for r in rows: f.write("\t".join(r)+"\n")
