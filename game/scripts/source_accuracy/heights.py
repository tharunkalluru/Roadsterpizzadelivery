#!/usr/bin/env python3
"""Read only the playable map AOI from Google's public 2023 Open Buildings COGs.

The cached 4m raster is an estimate, not a survey. Presence masks, footprint samples,
sample counts and dispersion are retained. No India height-accuracy claim is made.
Official source: https://sites.research.google/gr/open-buildings/temporal/
Discovery follows Google's published download notebook, without an EE account.
"""
import argparse, hashlib, json, math, os, urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import pyproj
import rasterio
from affine import Affine
from rasterio.enums import Resampling
from rasterio.warp import reproject
from rasterio.windows import Window, from_bounds
import shapely
from shapely.geometry import Polygon, box
from shapely.ops import transform as geometry_transform
import s2sphere

GAME = Path(__file__).resolve().parents[2]
BASE = GAME / 'public/world/hyd-metro/v2'
RAW = GAME / 'data/raw/google-open-buildings-2023'
OUT = GAME / 'data/interim/source-accuracy'
SOURCE = 'https://sites.research.google/gr/open-buildings/temporal/'
BUCKET = 'open-buildings-temporal-data'
YEAR = 2023
RES = 4.0
NODATA = -99.0
LAT0, LON0 = 17.4146, 78.5484
PHI = math.radians(LAT0)
E2, A = .00669437999014, 6378137.0
N = A / math.sqrt(1-E2*math.sin(PHI)**2)
M = A*(1-E2)/(1-E2*math.sin(PHI)**2)**1.5
KX, KZ = math.cos(PHI)*N*math.pi/180, M*math.pi/180

def read_json(path):
    with open(path) as stream:
        return json.load(stream)

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))+'\n')

def fetch_json(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return json.load(response)

def digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):
            h.update(block)
    return h.hexdigest()

def unproject(points):
    return [(LON0+p[0]/KX,LAT0-p[1]/KZ) for p in points]

def buildings():
    manifest=read_json(BASE/'manifest.json')
    return [b for c in manifest['chunks'] for b in read_json(BASE/c['file'])['buildings']]

def source_tiles(region):
    bounds=region.bounds
    cover=s2sphere.RegionCoverer();cover.min_level=2;cover.max_level=2;cover.max_cells=100
    rect=s2sphere.LatLngRect.from_point_pair(s2sphere.LatLng.from_degrees(bounds[1],bounds[0]),s2sphere.LatLng.from_degrees(bounds[3],bounds[2]))
    out=[]; manifests=[]
    for cell in cover.get_covering(rect):
        prefix=f'v1/manifests/{cell.to_token()}_'
        listing=fetch_json(f'https://storage.googleapis.com/storage/v1/b/{BUCKET}/o?prefix={prefix}&maxResults=1000')
        if listing.get('nextPageToken'):
            raise RuntimeError('Unexpected paginated manifest list; refusing an incomplete discovery')
        for record in listing.get('items',[]):
            if f'_{YEAR}_' not in record['name']:
                continue
            url=f"https://storage.googleapis.com/{BUCKET}/{record['name']}"
            data=fetch_json(url)
            for tileset in data['tilesets']:
                crs=tileset['crs'];project=pyproj.Transformer.from_crs(4326,crs,always_xy=True)
                projected=geometry_transform(project.transform,region)
                for source in tileset['sources']:
                    t=source['affineTransform'];d=source['dimensions']
                    transform=Affine(t['scaleX'],0,t['translateX'],0,t['scaleY'],t['translateY'])
                    corners=[transform*p for p in [(0,0),(d['width'],0),(d['width'],d['height']),(0,d['height'])]]
                    if not Polygon(corners).intersects(projected):
                        continue
                    uri=data['uriPrefix']+source['uris'][0]
                    out.append({'url':'https://storage.googleapis.com/'+uri[5:],'crs':crs,'manifest':url})
                    manifests.append(url)
    return sorted({x['url']:x for x in out}.values(),key=lambda x:x['url']),sorted(set(manifests))

def download_aoi(bs, probe=False):
    coords=[p for b in bs for p in b['footprint']]
    minx,maxx=min(p[0] for p in coords)-8,max(p[0] for p in coords)+8
    minz,maxz=min(p[1] for p in coords)-8,max(p[1] for p in coords)+8
    corners=unproject([(minx,minz),(maxx,minz),(maxx,maxz),(minx,maxz)])
    region=Polygon(corners)
    target_crs='EPSG:32644' # the complete playable AOI lies east of78E, inside UTM44N
    project=pyproj.Transformer.from_crs(4326,target_crs,always_xy=True)
    projected=geometry_transform(project.transform,region)
    x0,y0,x1,y1=projected.bounds
    x0,y0,x1,y1=math.floor(x0/RES)*RES,math.floor(y0/RES)*RES,math.ceil(x1/RES)*RES,math.ceil(y1/RES)*RES
    width,height=round((x1-x0)/RES),round((y1-y0)/RES)
    path=RAW/'hyderabad-playable-aoi-4m.tif'
    meta_path=RAW/'fetch-manifest.json'
    if path.exists() and meta_path.exists():
        meta=read_json(meta_path)
        if meta.get('boundsUTM')==[x0,y0,x1,y1] and meta.get('sha256')==digest(path):
            return path,meta
    tiles,manifests=source_tiles(region)
    print(json.dumps({'aoi':region.bounds,'rasterSize':[width,height],'tiles':tiles,'nativeResolutionM':.5,'effectiveResolutionM':4}),flush=True)
    if not tiles:
        raise RuntimeError('No2023 public COG covers the playable map')
    if any(t['crs']!=target_crs for t in tiles):
        raise RuntimeError('AOI crosses a CRS boundary; implement separate reprojection explicitly')
    transform=Affine(RES,0,x0,0,-RES,y1)
    raster=np.full((2,height,width),NODATA,dtype='float32')
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_HTTP_MAX_RETRY='2',GDAL_HTTP_RETRY_DELAY='1'):
        for i,tile in enumerate(tiles):
            with rasterio.open(tile['url']) as source:
                print('COG',i+1,'/',len(tiles),'dimensions',source.width,source.height,'overviews',source.overviews(2),'bytes fetched: bounded window only',flush=True)
                if probe:
                    return None,{'probe':True,'overviews':source.overviews(2),'bands':source.descriptions,'tile':tile}
                left,bottom,right,top=max(x0,source.bounds.left),max(y0,source.bounds.bottom),min(x1,source.bounds.right),min(y1,source.bounds.top)
                window=from_bounds(left,bottom,right,top,source.transform)
                # Snap reads to the8x overview grid, preserving a true4m sampling resolution.
                col,row=math.floor(window.col_off/8)*8,math.floor(window.row_off/8)*8
                w,h=math.ceil((window.col_off+window.width-col)/8)*8,math.ceil((window.row_off+window.height-row)/8)*8
                window=Window(col,row,min(w,source.width-col),min(h,source.height-row))
                data=source.read([2,3],window=window,out_shape=(2,math.ceil(window.height/8),math.ceil(window.width/8)),resampling=Resampling.average)
                source_transform=source.window_transform(window)*Affine.scale(window.width/data.shape[2],window.height/data.shape[1])
                col0=max(0,math.floor((left-x0)/RES));row0=max(0,math.floor((y1-top)/RES))
                col1=min(width,math.ceil((right-x0)/RES));row1=min(height,math.ceil((y1-bottom)/RES))
                dest=np.full((2,row1-row0,col1-col0),NODATA,dtype='float32')
                dest_transform=transform*Affine.translation(col0,row0)
                for band in range(2):
                    reproject(data[band],dest[band],src_transform=source_transform,src_crs=source.crs,dst_transform=dest_transform,dst_crs=target_crs,src_nodata=NODATA,dst_nodata=NODATA,resampling=Resampling.nearest)
                block=raster[:,row0:row1,col0:col1]
                valid=(block[0]==NODATA)&(dest[0]!=NODATA)&(dest[1]!=NODATA)
                block[:,valid]=dest[:,valid]
    RAW.mkdir(parents=True,exist_ok=True)
    with rasterio.open(path,'w',driver='GTiff',width=width,height=height,count=2,dtype='float32',crs=target_crs,transform=transform,nodata=NODATA,compress='deflate',predictor=3,tiled=True) as out:
        out.write(raster);out.set_band_description(1,'building_height_2023_m');out.set_band_description(2,'building_presence_2023')
    meta={'dataset':'Google Open Buildings2.5D Temporal v1','year':YEAR,'source':SOURCE,'license':'CC-BY-4.0','fetchedAt':datetime.now(timezone.utc).isoformat(),'sourceManifests':manifests,'sourceTiles':tiles,'boundsUTM':[x0,y0,x1,y1],'boundsWGS84':list(region.bounds),'crs':target_crs,'resolutionM':RES,'nativeResolutionM':.5,'effectiveResolutionM':4,'sha256':digest(path),'bytes':path.stat().st_size,'limitations':['2023 satellite model estimate, not a current measurement','Effective4m resolution and roof-position drift; small adjoining roofs may be unresolved','Height evaluation accuracy was not established for India','Predicted heights capped at100m']}
    write_json(meta_path,meta)
    return path,meta

def summarize_pixels(heights,presence,inside):
    """Reject weak/small/mixed roof samples before assigning a footprint estimate.

    The presence threshold is an uncalibrated screening rule, not a probability of accuracy.
    Sampling centres inside the footprint also excludes holes and adjacent roofs.
    """
    pixels=int(inside.sum())
    valid=inside&np.isfinite(heights)&(heights>=2.5)&(heights<=100)&(presence>=.5)&(presence<=1.0001)
    valid_count=int(valid.sum());fraction=valid_count/max(1,pixels)
    if pixels<2 or valid_count<2:return None,'insufficient_pixels'
    if fraction<.5:return None,'weak_presence_mask'
    h=heights[valid];median=float(np.median(h));q1,q3=np.percentile(h,[25,75]);iqr=float(q3-q1)
    if iqr>max(8,.75*median):return None,'mixed_or_unstable_roofs'
    return {'heightM':round(median,1),'samplePixels':valid_count,'footprintPixels':pixels,'validFraction':round(fraction,3),'iqrM':round(iqr,1),'presenceMedian':round(float(np.median(presence[valid])),3)},'accepted'

def sample(bs,path,meta):
    records={};counts=Counter()
    with rasterio.open(path) as source:
        values=source.read();transform=source.transform;inverse=~transform
        project=pyproj.Transformer.from_crs(4326,source.crs,always_xy=True)
        for b in bs:
            def ring(points):
                ll=unproject(points);xs,ys=project.transform([p[0] for p in ll],[p[1] for p in ll]);return list(zip(xs,ys))
            poly=Polygon(ring(b['footprint']),[ring(h) for h in b.get('holes',[])])
            x0,y0,x1,y1=poly.bounds;c0,r0=inverse*(x0,y1);c1,r1=inverse*(x1,y0)
            c0,r0,c1,r1=max(0,math.floor(c0)),max(0,math.floor(r0)),min(source.width,math.ceil(c1)),min(source.height,math.ceil(r1))
            if c1<=c0 or r1<=r0:
                counts['outside_aoi']+=1;continue
            xs=transform.c+(np.arange(c0,c1)+.5)*RES;ys=transform.f-(np.arange(r0,r1)+.5)*RES
            xx,yy=np.meshgrid(xs,ys);inside=shapely.contains_xy(poly,xx,yy)
            heights,presence=values[0,r0:r1,c0:c1],values[1,r0:r1,c0:c1]
            record,status=summarize_pixels(heights,presence,inside);counts[status]+=1
            if record:records[b['id']]=record
    result={'version':1,'source':SOURCE,'year':YEAR,'rasterSha256':meta['sha256'],'effectiveResolutionM':4,'method':'median of footprint pixel centres;presence>=0.5;height2.5..100m;>=2pixels;>=50%valid;IQR<=max(8m,75%median)','counts':dict(counts),'buildings':records,'limitations':meta['limitations']}
    write_json(OUT/'satellite-heights.json',result)
    print('HEIGHT_SAMPLES',json.dumps(result['counts']),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--probe',action='store_true');args=parser.parse_args()
    bs=buildings();path,meta=download_aoi(bs,args.probe)
    if args.probe:print(json.dumps(meta,indent=2))
    else:sample(bs,path,meta)
