# Crops the downloaded drawings and turns them into alpha masks for the site (see docs/SITE.md).
#   python3 -I scripts/drawings/process.py <downloaded dir> public/drawings
import sys, math, pathlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
src=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
Image.MAX_IMAGE_PIXELS=None
def to_mask(gray, lo=60, hi=200):
    a=np.asarray(gray,dtype=np.float32); a=(hi-a)/(hi-lo); a=np.clip(a,0,1)*255
    rgba=np.zeros((*a.shape,4),dtype=np.uint8); rgba[...,:3]=255; rgba[...,3]=a.astype(np.uint8)
    return Image.fromarray(rgba,"RGBA")
def save(img, name, width):
    if img.width>width: img=img.resize((width, round(img.height*width/img.width)), Image.LANCZOS)
    img.save(out/f"{name}.webp", "WEBP", quality=80, method=6); print(name, img.size, (out/f"{name}.webp").stat().st_size//1024, "KB")
def crop(f, w,h,x,y): return Image.open(src/f).convert("L").crop((x,y,x+w,y+h))
# static drawings
save(to_mask(crop("c07.jpg",2580,1170,870,360)), "gears-train", 1400)
save(to_mask(crop("c08.jpg",3060,2080,380,160)), "cane-mill-line", 2000)
save(to_mask(crop("c03.jpg",2000,1240,1780,1280)), "mill-gearing", 1200)
save(to_mask(crop("c04.jpg",2000,2160,60,400)), "art-of-milling", 1200)
save(to_mask(crop("c06.jpg",1520,920,2260,1060)), "molino", 1200)
save(to_mask(crop("c01.jpg",2600,3800,360,300)), "engine-isometric", 1200)
# The engraving: a median filter and tighter levels drop the paper texture.
enc=crop("c05.jpg",3000,2200,420,300).filter(ImageFilter.MedianFilter(3)).resize((1400,1027),Image.LANCZOS)
save(to_mask(enc, lo=35, hi=120), "encyclopedie-1765", 1400)
# hero: beam engine with moving parts as separate layers
g=crop("c02.jpg",2300,1700,200,500); W,H=g.size
cx,cy,R=799.1,769.6,532.3
wheel=Image.new("L",(W,H),0); d=ImageDraw.Draw(wheel)
d.ellipse((cx-R-14,cy-R-14,cx+R+14,cy+R+14),fill=255); d.ellipse((cx-440,cy-440,cx+440,cy+440),fill=0)  # rim annulus
for k in range(8):
    a=math.radians(k*45); ux,uy=math.cos(a),-math.sin(a); px,py=-uy,ux; w=12
    p0=(cx+95*ux,cy+95*uy); p1=(cx+452*ux,cy+452*uy)
    d.polygon([(p0[0]+w*px,p0[1]+w*py),(p1[0]+w*px,p1[1]+w*py),(p1[0]-w*px,p1[1]-w*py),(p0[0]-w*px,p0[1]-w*py)],fill=255)
d.ellipse((cx-112,cy-112,cx+112,cy+112),fill=255)  # hub, crank, eccentric
gov=Image.new("L",(W,H),0); ImageDraw.Draw(gov).rectangle((1290,410,1470,640),fill=255)
ga=np.asarray(g); wm=np.asarray(wheel)>0; gm=np.asarray(gov)>0
base=ga.copy(); base[wm|gm]=255
wl=np.full_like(ga,255); wl[wm]=ga[wm]
gl=np.full_like(ga,255); gl[gm]=ga[gm]
s=0.7
base_img=to_mask(Image.fromarray(base)).resize((round(W*s),round(H*s)),Image.LANCZOS)
b=np.array(base_img); b[:, :28, 3]=0; b[:, 1588:, 3]=0  # the sheet's border lines
save(Image.fromarray(b,"RGBA"), "engine-base", round(W*s))
r2=int(R+16); save(to_mask(Image.fromarray(wl).crop((int(cx-r2),int(cy-r2),int(cx+r2),int(cy+r2)))), "engine-flywheel", round(2*r2*s))
save(to_mask(Image.fromarray(gl).crop((1290,410,1470,640))), "engine-governor", round(180*s))
print("geometry (base px at scale):", dict(W=round(W*s),H=round(H*s),cx=round(cx*s,1),cy=round(cy*s,1),r2=round(r2*s,1),gov=(round(1290*s),round(410*s),round(180*s),round(230*s))))
