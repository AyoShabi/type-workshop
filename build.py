import json, itertools, os, io, shutil
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset
# Source variable fonts and their OFL-<name>.txt files go in fonts-src/ (not committed).
S='fonts-src/'; O='public/fonts/'
U=list(range(0x20,0x7f))+list(range(0xa0,0x180))+[0x2013,0x2014,0x2018,0x2019,0x201a,0x201c,0x201d,0x201e,0x2022,0x2026,0x2039,0x203a,0x20ac,0x2122,0x2190,0x2192,0x2191,0x2193,0x2605,0x2665]
fams=[
 ('anybody','Anybody','anybody',{'wdth':[50,75,100,125,150],'wght':list(range(100,1000,100))},{'wdth':100,'wght':800},None),
 ('tiltwarp','Tilt Warp','tiltwarp',{'XROT':list(range(-45,46,15)),'YROT':list(range(-45,46,15))},{'XROT':0,'YROT':0},None),
 ('sofia','Sofia Sans Extra Condensed','sofiasansextracondensed',{'wght':list(range(100,1001,100))},{'wght':900},None),
 ('bigshoulders','Big Shoulders Display','bigshouldersdisplay',{'wght':list(range(100,1000,100))},{'wght':800},None),
 ('gasoek','Gasoek One','gasoekone',{},{},None),
 ('monasans','Mona Sans','monasans',{'wdth':[75,100,125],'wght':list(range(200,1000,100))},{'wdth':100,'wght':800},'Mona'),
]
man=[]
for slug,name,gdir,axes,default,rfn in fams:
    os.makedirs(O+slug,exist_ok=True)
    shutil.copy(S+f'OFL-{gdir}.txt',O+slug+'/OFL.txt')
    tags=list(axes); combos=list(itertools.product(*[axes[t] for t in tags])) or [()]
    total=0
    for c in combos:
        f=TTFont(S+slug+'.ttf')
        loc=dict(zip(tags,c))
        if loc: f=instancer.instantiateVariableFont(f,loc)
        opts=subset.Options(); opts.hinting=False; opts.layout_features=['*']; opts.name_IDs=['*']; opts.name_languages=['*']; opts.notdef_outline=True; opts.drop_tables+=['DSIG','STAT','gasp','hdmx','LTSH','VDMX']
        opts.glyph_names=True
        s=subset.Subsetter(opts); s.populate(unicodes=U); s.subset(f)
        for t in ['STAT','fvar','avar','gvar','HVAR','MVAR','cvar','DSIG']:
            if t in f: del f[t]
        fn='-'.join(f'{t}{v}' for t,v in loc.items()) or 'regular'
        f.save(O+f'{slug}/{fn}.ttf'); total+=os.path.getsize(O+f'{slug}/{fn}.ttf')
    man.append(dict(slug=slug,name=name,axes=[dict(tag=t,values=axes[t]) for t in tags],default=default,rfn=rfn,copyright=TTFont(S+slug+'.ttf')['name'].getDebugName(0)))
    print(slug,len(combos),total//1024,'KB')
json.dump(man,open('src/manifest.json','w'),indent=1)
