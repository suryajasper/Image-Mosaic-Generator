import os
import tempfile
import unittest
from pathlib import Path
import sys
import numpy as np
from PIL import Image

workspace = tempfile.TemporaryDirectory()
os.environ['MOSAIC_DATA_DIR'] = workspace.name
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import server

class LocalLibraryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name)
        self.client = server.app.test_client()
        with server.db() as conn:
            for table in ('pieces','projects','group_photos','groups','heic_sources','heic_conversions'):
                conn.execute('DELETE FROM ' + table)
            conn.execute('DELETE FROM photos')
            conn.execute('DELETE FROM settings')
            conn.execute('DELETE FROM portraits')
        Image.new('RGB', (100, 80), (90, 80, 70)).save(self.folder / 'a.jpg')
        Image.new('RGB', (80, 100), (210, 200, 190)).save(self.folder / 'b.png')

    def tearDown(self):
        self.tmp.cleanup()

    def scan(self, **extra):
        return self.client.post('/api/import', json={'path': str(self.folder), **extra})

    def test_sharp_tiles_preserve_crop_and_separate_cache_sizes(self):
        Image.new('RGB', (1800, 1200), 'red').save(self.folder / 'large.jpg')
        self.scan()
        photo = next(p for p in self.client.get('/api/library').json['photos'] if p['name'] == 'large.jpg')
        self.client.patch('/api/photos/' + photo['id'], json={'x': .5, 'y': .5, 'size': .5, 'rotation': 90})
        import io
        for size, expected in ((256, 256), (512, 512), (1024, 600)):
            response = self.client.get(f"/api/photos/{photo['id']}/image?size={size}")
            self.assertEqual(response.status_code, 200)
            with Image.open(io.BytesIO(response.data)) as image:
                self.assertEqual(image.size, (expected, expected))
            response.close()
        self.assertEqual(self.client.get(f"/api/photos/{photo['id']}/image?size=9999").status_code, 400)

    def test_crop_selection_external_changes_and_restart(self):
        self.assertEqual(self.scan().json['imported'], 2)
        first = self.client.get('/api/library').json['photos'][0]
        self.client.patch('/api/photos/'+first['id'], json={'x': .2, 'y': .8, 'size': .4, 'rotation':90,'selected':False})
        old = Path(first['path']); new = old.with_name('renamed'+old.suffix);old.rename(new)
        self.scan()
        record = server.photo(first['id'])
        self.assertEqual(record['path'],str(new))
        self.assertEqual(record['size'],.4)
        self.assertEqual(record['selected'],0)
        image = server.open_photo(record)
        self.assertEqual(image.size,(32,32))
        saved = new.read_bytes();new.unlink();self.scan()
        self.assertEqual(len(self.client.get('/api/library').json['photos']),1)
        new.write_bytes(saved);self.scan()
        restored=self.client.get('/api/library').json['photos']
        self.assertEqual(len(restored),2)
        self.assertEqual(next(p for p in restored if p['path']==str(new))['size'],.4)
        Image.new('RGB',(20,20),'red').save(self.folder/'new.jpg');self.scan()
        self.assertEqual(len(self.client.get('/api/library').json['photos']),3)

    def test_multiple_groups_preserve_crops_and_deduplicate_overlaps(self):
        self.scan(name='Family')
        first=self.client.get('/api/library').json['photos'][0]
        self.client.patch('/api/photos/'+first['id'],json={'size':.4,'rotation':90})
        nested=self.folder/'Friends';nested.mkdir()
        Image.new('RGB',(50,50),'blue').save(nested/'friend.png')
        self.scan()
        self.client.post('/api/import',json={'path':str(nested),'name':'Friends'})
        library=self.client.get('/api/library').json
        self.assertEqual(len(library['groups']),2)
        self.assertEqual(len(library['photos']),3)
        shared=next(p for p in library['photos'] if p['name']=='friend.png')
        self.assertEqual(len(shared['groups']),2)
        self.assertEqual(server.photo(first['id'])['size'],.4)
        friend_group=next(g for g in library['groups'] if g['name']=='Friends')
        self.client.patch('/api/groups/'+friend_group['id'],json={'name':'Old friends'})
        self.client.delete('/api/groups/'+friend_group['id'])
        self.assertEqual(len(self.client.get('/api/library').json['photos']),3)
        self.client.post('/api/import',json={'path':str(nested)})
        restored=next(g for g in self.client.get('/api/library').json['groups'] if g['id']==friend_group['id'])
        self.assertEqual(restored['name'],'Old friends')
        # Taking one directory offline retains membership and corrections.
        moved=nested.with_name('offline');nested.rename(moved)
        response=self.client.post('/api/import',json={'path':str(nested)})
        self.assertTrue(response.json['unavailable'])
        group=next(g for g in self.client.get('/api/library').json['groups'] if g['id']==friend_group['id'])
        self.assertEqual(group['status'],'unavailable')
        moved.rename(nested)
        self.client.post('/api/import',json={'path':str(nested)})
        self.assertEqual(server.photo(first['id'])['rotation'],90)

    def mask_payload(self,project,box):
        import base64,io
        image=Image.new('L',(project['width'],project['height']),0)
        image.paste(255,box)
        output=io.BytesIO();image.save(output,'PNG')
        return 'data:image/png;base64,'+base64.b64encode(output.getvalue()).decode()

    def test_halo_falloff_direction_shape_and_validation(self):
        source = Image.new('L', (100, 100), 0)
        source.paste(255, (40, 30, 60, 70))
        effect = dict(preset='soft-halo', sourceId='subject', reach=.2, strength=.6, reverse=False, shape='silhouette')
        server.pieces.effects.validate(effect, {'subject'})
        alpha = np.asarray(server.pieces.effects.build(effect, source))
        self.assertEqual(alpha[50, 60], 152)
        self.assertGreater(alpha[50, 65], alpha[50, 75])
        self.assertEqual(alpha[50, 85], 0)
        inverse = np.asarray(server.pieces.effects.build({**effect, 'reverse': True}, source))
        self.assertTrue(np.all(np.abs(alpha.astype(int) + inverse.astype(int) - 153) <= 1))
        wider = np.asarray(server.pieces.effects.build({**effect, 'reach': .4}, source))
        self.assertGreater(wider[50, 75], alpha[50, 75])
        ellipse = np.asarray(server.pieces.effects.build({**effect, 'shape': 'ellipse'}, source))
        self.assertGreater(ellipse[50, 65], ellipse[50, 85])
        with self.assertRaises(ValueError):
            server.pieces.effects.validate({**effect, 'strength': float('nan')}, {'subject'})
        with self.assertRaises(ValueError):
            server.pieces.effects.validate(effect, {'other'})
        with self.assertRaises(ValueError):
            server.pieces.effects.build(effect, Image.new('L', (100, 100), 0))

    def test_halo_persistence_usage_mask_updates_and_source_deletion(self):
        self.scan()
        self.client.post('/api/target', json={'path': str(self.folder/'a.jpg')})
        project = self.client.get('/api/project').json
        key = project['id']
        group = self.client.get('/api/library').json['groups'][0]['id']
        subject = self.client.post('/api/pieces', json={'projectId': key, 'name': 'Subject'}).json['id']
        self.client.patch('/api/pieces/'+subject, json={'projectId': key, 'mode': 'original', 'revision': 0, 'mask': self.mask_payload(project, (30, 20, 70, 60))})
        self.client.post('/api/project/options', json={'projectId': key, 'mode': 'mosaic', 'groups': [group]})
        baseline = self.client.post('/api/mosaic', json={'columns':12, 'variety':1}).json
        effect = dict(preset='soft-halo', sourceId=subject, reach=.25, strength=.55, reverse=False, shape='silhouette')
        self.assertEqual(self.client.post('/api/project/options', json={'projectId':key, 'effect':effect}).status_code, 200)
        self.assertEqual(self.client.get('/api/project').json['remainder_effect'], effect)
        result = self.client.post('/api/mosaic', json={'columns':12, 'variety':1}).json
        self.assertEqual(result['counts'], baseline['counts'])
        self.assertEqual(result['layers'][0]['tiles'], baseline['layers'][0]['tiles'])
        treatment = result['layers'][0]['treatment']
        with self.client.get(treatment['alphaUrl']) as response:
            import io
            with Image.open(io.BytesIO(response.data)) as alpha:
                self.assertEqual(alpha.size, (100, 80))
                self.assertGreater(alpha.getpixel((70, 40))[3], alpha.getpixel((99, 40))[3])
        self.client.patch('/api/pieces/'+subject, json={'projectId':key, 'revision':1, 'mask':self.mask_payload(project, (10,20,40,60))})
        changed = self.client.post('/api/mosaic', json={'columns':12}).json
        self.assertNotEqual(changed['layers'][0]['treatment']['alphaUrl'], treatment['alphaUrl'])
        bad = self.client.patch('/api/pieces/'+subject, json={'projectId':key, 'effect':{**effect,'sourceId':'foreign'}})
        self.assertEqual(bad.status_code, 400)
        self.client.patch('/api/pieces/'+subject, json={'projectId':key, 'effect':effect})
        self.assertEqual(self.client.get('/api/project').json['pieces'][0]['effect'], effect)
        self.client.delete('/api/pieces/'+subject, json={'projectId':key})
        self.assertIsNone(self.client.get('/api/project').json['remainder_effect'])
        self.assertEqual(self.client.post('/api/mosaic', json={'columns':12}).status_code, 200)

    def test_pieces_match_only_assigned_groups_and_preserve_overlap_priority(self):
        self.scan(name='Family')
        family=self.client.get('/api/library').json['groups'][0]['id']
        other=self.folder/'friends';other.mkdir()
        Image.new('RGB',(50,50),'blue').save(other/'friend.png')
        self.client.post('/api/import',json={'path':str(other),'name':'Friends'})
        library=self.client.get('/api/library').json
        friends=next(g for g in library['groups'] if g['name']=='Friends')['id']
        friend=next(p for p in library['photos'] if p['name']=='friend.png')['id']
        self.client.post('/api/target',json={'path':str(self.folder/'a.jpg')})
        project=self.client.get('/api/project').json
        key=project['id'];w,h=project['width'],project['height']
        face=self.client.post('/api/pieces',json={'projectId':key,'name':'Face'}).json['id']
        suit=self.client.post('/api/pieces',json={'projectId':key,'name':'Suit'}).json['id']
        self.assertEqual(self.client.patch('/api/pieces/'+face,json={'projectId':key,'groups':[family],'mode':'original','revision':0,'mask':self.mask_payload(project,(0,0,w//2,h))}).status_code,200)
        self.assertEqual(self.client.patch('/api/pieces/'+suit,json={'projectId':key,'groups':[friends],'revision':0,'mask':self.mask_payload(project,(0,0,w,h))}).status_code,200)
        result=self.client.post('/api/mosaic',json={'columns':12,'variety':1}).json
        self.assertEqual(result['mosaicRegion'],'pieces')
        self.assertEqual(len(result['layers']),1)
        layer=result['layers'][0]
        self.assertEqual(layer['name'],'Suit')
        self.assertEqual(layer['activeTiles'],60)
        self.assertEqual(sum(result['counts']),60)
        self.assertEqual(result['counts'][result['ids'].index(friend)],60)
        self.assertTrue(all(i==result['ids'].index(friend) for i in layer['tiles'] if i>=0))
        import io
        with self.client.get(layer['maskUrl']) as response:
            with Image.open(io.BytesIO(response.data)) as mask:
                self.assertEqual(mask.getpixel((0,0))[3],0)
                self.assertEqual(mask.getpixel((w-1,0))[3],255)
        with self.client.get(result['backgroundUrl']) as response:
            self.assertEqual(response.status_code,200)
        # Reordering makes the Suit own the entire frame.
        self.client.post('/api/project/order',json={'projectId':key,'ids':[suit,face]})
        full=self.client.post('/api/mosaic',json={'columns':12,'variety':1}).json
        self.assertEqual(full['activeTiles'],120)
        # Empty pool errors name the piece rather than borrowing another group's photos.
        self.client.patch('/api/pieces/'+suit,json={'projectId':key,'groups':[]})
        response=self.client.post('/api/mosaic',json={'columns':12})
        self.assertEqual(response.status_code,400)
        self.assertIn('Suit',response.json['error'])
        # An old editor cannot overwrite the new mask revision.
        self.assertEqual(self.client.patch('/api/pieces/'+face,json={'projectId':key,'revision':0,'mask':self.mask_payload(project,(0,0,w,h))}).status_code,400)

    def test_independent_piece_tuning_and_default_inheritance(self):
        self.scan()
        self.client.post('/api/target',json={'path':str(self.folder/'a.jpg')})
        project=self.client.get('/api/project').json
        key=project['id'];w,h=project['width'],project['height']
        face=self.client.post('/api/pieces',json={'projectId':key,'name':'Face'}).json['id']
        suit=self.client.post('/api/pieces',json={'projectId':key,'name':'Suit'}).json['id']
        for piece,box,settings in ((face,(0,0,w//2,h),{'columns':12,'variety':0,'blend':0}),(suit,(w//2,0,w,h),{'columns':24,'variety':1,'blend':.65})):
            response=self.client.patch('/api/pieces/'+piece,json={'projectId':key,'revision':0,'mask':self.mask_payload(project,box),**settings})
            self.assertEqual(response.status_code,200)
        result=self.client.post('/api/mosaic',json={'columns':60,'variety':.35,'blend':.2}).json
        first,second=result['layers']
        self.assertEqual((first['columns'],first['rows'],first['variety'],first['blend']),(12,10,0,0))
        self.assertEqual((second['columns'],second['rows'],second['variety'],second['blend']),(24,20,1,.65))
        self.assertEqual(len(first['tiles']),120)
        self.assertEqual(len(second['tiles']),480)
        self.assertEqual(first['activeTiles'],60)
        self.assertEqual(second['activeTiles'],240)
        self.assertEqual(second['counts'],[120,120])
        self.assertEqual(sum(result['counts']),300)
        self.assertEqual(result['activeTiles'],300)
        self.assertEqual(result['aspectRatio'],.8)
        # Defaults cannot override customized pieces, and changing one piece leaves the other stable.
        other=self.client.post('/api/mosaic',json={'columns':80,'variety':.9,'blend':.5}).json
        self.assertEqual(first,other['layers'][0])
        self.assertEqual(second,other['layers'][1])
        self.client.patch('/api/pieces/'+face,json={'projectId':key,'columns':18,'variety':.2,'blend':.3})
        tuned=self.client.post('/api/mosaic',json={'columns':60}).json
        self.assertEqual(second,tuned['layers'][1])
        saved=next(p for p in self.client.get('/api/project').json['pieces'] if p['id']==face)
        self.assertEqual((saved['columns'],saved['variety'],saved['blend']),(18,.2,.3))
        # Reset restores live inheritance, including zero variety/blend values.
        self.client.patch('/api/pieces/'+face,json={'projectId':key,'columns':None,'variety':None,'blend':None})
        inherited=self.client.post('/api/mosaic',json={'columns':36,'variety':0,'blend':0}).json['layers'][0]
        self.assertEqual((inherited['columns'],inherited['variety'],inherited['blend']),(36,0,0))

    def test_custom_grid_limits_do_not_depend_on_studio_defaults(self):
        self.scan()
        path=self.folder/'tall.png';Image.new('RGB',(100,1000),'blue').save(path)
        self.client.post('/api/target',json={'path':str(path)})
        project=self.client.get('/api/project').json
        piece=self.client.post('/api/pieces',json={'projectId':project['id'],'name':'Tall piece'}).json['id']
        self.client.patch('/api/pieces/'+piece,json={'projectId':project['id'],'columns':12,'variety':1,'revision':0,'mask':self.mask_payload(project,(0,0,100,1000))})
        result=self.client.post('/api/mosaic',json={'columns':160})
        self.assertEqual(result.status_code,200)
        self.assertEqual((result.json['layers'][0]['columns'],result.json['layers'][0]['rows']),(12,120))
        self.client.patch('/api/pieces/'+piece,json={'projectId':project['id'],'columns':160})
        rejected=self.client.post('/api/mosaic',json={'columns':12})
        self.assertEqual(rejected.status_code,400)
        self.assertIn('Tall piece',rejected.json['error'])

    def test_remainder_tuning_and_invalid_values(self):
        self.scan()
        self.client.post('/api/target',json={'path':str(self.folder/'a.jpg')})
        project=self.client.get('/api/project').json
        group=self.client.get('/api/library').json['groups'][0]['id']
        key=project['id']
        response=self.client.post('/api/project/options',json={'projectId':key,'mode':'mosaic','groups':[group],'columns':18,'variety':1,'blend':.4})
        self.assertEqual(response.status_code,200)
        layer=self.client.post('/api/mosaic',json={'columns':60,'variety':0,'blend':0}).json['layers'][0]
        self.assertEqual((layer['columns'],layer['rows'],layer['variety'],layer['blend']),(18,15,1,.4))
        self.assertEqual(layer['counts'],[135,135])
        saved=self.client.get('/api/project').json
        self.assertEqual(saved['remainder_blend'],.4)
        piece=self.client.post('/api/pieces',json={'projectId':key,'name':'Face'}).json['id']
        for bad in ({'columns':11},{'columns':161},{'columns':12.5},{'variety':-1},{'variety':True},{'variety':1.01},{'blend':-.01},{'blend':.66}):
            self.assertEqual(self.client.patch('/api/pieces/'+piece,json={'projectId':key,**bad}).status_code,400)
            self.assertEqual(self.client.post('/api/project/options',json={'projectId':key,**bad}).status_code,400)

    def test_selection_prompt_validation_and_local_candidates(self):
        from unittest.mock import patch
        self.scan()
        self.client.post('/api/target',json={'path':str(self.folder/'a.jpg')})
        project=self.client.get('/api/project').json
        points=[{'x':.5,'y':.5,'include':1}]
        with patch.object(server.pieces.segmentation,'predict',return_value=([Image.new('L',(100,80),255)],{'prepareSeconds':0,'promptSeconds':0})) as predict:
            result=self.client.post('/api/project/select',json={'projectId':project['id'],'points':points})
            self.assertEqual(result.status_code,200)
            self.assertEqual(predict.call_args.args[2],points)
            with self.client.get(result.json['masks'][0]) as response:
                self.assertEqual(response.status_code,200)
            self.assertEqual(self.client.post('/api/project/select',json={'projectId':project['id'],'points':[{'x':2,'y':.5,'include':1}]}).status_code,400)
            self.assertEqual(self.client.post('/api/project/select',json={'projectId':project['id'],'box':[.5,.5,.1,.1]}).status_code,400)
            self.assertEqual(predict.call_count,1)
        piece=self.client.post('/api/pieces',json={'projectId':project['id'],'name':'Face'}).json['id']
        response=self.client.patch('/api/pieces/'+piece,json={'projectId':project['id'],'mask':self.mask_payload(project,(0,0,50,80)),'revision':0,'prompts':{'points':points,'box':None}})
        self.assertEqual(response.status_code,200)
        self.assertEqual(self.client.get('/api/project').json['pieces'][0]['prompts']['points'],points)

    def test_portrait_pieces_restore_and_detect_changed_sources(self):
        self.scan()
        path=str(self.folder/'a.jpg')
        self.client.post('/api/target',json={'path':path})
        project=self.client.get('/api/project').json
        piece=self.client.post('/api/pieces',json={'projectId':project['id'],'name':'Face'}).json['id']
        self.client.post('/api/target',json={'path':str(self.folder/'b.png')})
        self.assertEqual(self.client.get('/api/project').json['pieces'],[])
        self.assertEqual(self.client.post('/api/project/options',json={'projectId':project['id'],'mode':'mosaic'}).status_code,400)
        self.client.post('/api/target',json={'path':path})
        self.assertEqual(self.client.get('/api/project').json['pieces'][0]['id'],piece)
        Image.new('RGB',(80,60),'green').save(path)
        self.assertTrue(self.client.get('/api/project').json['stale'])
        self.assertEqual(self.client.post('/api/mosaic',json={'columns':12}).status_code,400)
        self.client.post('/api/project/reset',json={'projectId':project['id'],'reuse':True})
        restored=self.client.get('/api/project').json
        self.assertFalse(restored['stale'])
        self.assertEqual(restored['pieces'][0]['mask_revision'],1)
        self.assertEqual(restored['width'],80)

    def test_remainder_uses_union_without_duplicate_photos(self):
        self.scan()
        self.client.post('/api/target',json={'path':str(self.folder/'a.jpg')})
        project=self.client.get('/api/project').json
        group=self.client.get('/api/library').json['groups'][0]['id']
        response=self.client.post('/api/project/options',json={'projectId':project['id'],'mode':'mosaic','groups':[group,group]})
        self.assertEqual(response.status_code,200)
        result=self.client.post('/api/mosaic',json={'columns':12,'variety':1}).json
        self.assertEqual(len(result['ids']),2)
        self.assertEqual(result['counts'],[60,60])
        self.assertEqual(result['pieceUsage'][0]['name'],'Everything else')
        self.client.delete('/api/groups/'+group)
        self.assertEqual(self.client.post('/api/project/options',json={'projectId':project['id'],'mode':'original'}).status_code,200)
        # An entirely untiled portrait can render without memory photos.
        self.client.post('/api/selection',json={'selected':False})
        original=self.client.post('/api/mosaic',json={'columns':12}).json
        self.assertEqual(original['layers'],[])
        self.assertEqual(original['activeTiles'],0)

    def test_matching_counts_and_determinism(self):
        pixels=np.tile([100.,100.,100.],(200,1));colors=np.array([[100.,100.,100.],[110.,110.,110.],[120.,120.,120.]])
        exact, counts=server.match_tiles(pixels,colors,0,42)
        self.assertEqual(counts.tolist(),[200,0,0])
        tiles,counts=server.match_tiles(pixels,colors,1,42)
        self.assertEqual(counts.sum(),200)
        self.assertTrue(np.all(counts>0))
        self.assertTrue(np.array_equal(tiles,server.match_tiles(pixels,colors,1,42)[0]))

    def test_full_variety_is_balanced_random_and_ignores_colors(self):
        colors=np.array([[0.,0.,0.],[255.,255.,255.],[20.,30.,40.],[80.,90.,100.]])
        for total in (0, 2, 4, 17, 200):
            pixels=np.zeros((total,3))
            tiles,counts=server.match_tiles(pixels,colors,1,42)
            self.assertEqual(len(tiles),total)
            self.assertEqual(counts.sum(),total)
            self.assertLessEqual(int(counts.max()-counts.min()),1)
            self.assertTrue(np.array_equal(counts,np.bincount(tiles,minlength=len(colors))))
            recolored,_=server.match_tiles(np.full((total,3),255.),colors[::-1],1,42)
            self.assertTrue(np.array_equal(tiles,recolored))
        self.assertFalse(np.array_equal(tiles,server.match_tiles(pixels,colors,1,43)[0]))

    def test_heic_confirmation_and_cached_conversion(self):
        from pillow_heif import from_pillow
        heic=(self.folder/'memory.HEIC').resolve()
        from_pillow(Image.new('RGB',(90,60),'orange')).save(heic)
        original=heic.read_bytes()
        self.assertEqual(len(self.scan().json['needsConversion']),1)
        self.assertEqual(self.client.post('/api/convert',json={'paths':[str(heic)]}).status_code,200)
        self.assertTrue(server.converted_path(heic).is_file())
        self.assertEqual(self.scan().json['imported'],3)
        self.assertEqual(heic.read_bytes(),original)
        row=next(p for p in self.client.get('/api/library').json['photos'] if p['path']==str(heic))
        with self.client.get('/api/photos/'+row['id']+'/image') as response:
            self.assertEqual(response.status_code,200)
        renamed=heic.with_name('renamed.HEIC');heic.rename(renamed)
        self.assertNotIn('needsConversion',self.scan().json)
        heic=renamed
        self.assertEqual(self.client.post('/api/target',json={'path':str(heic)}).status_code,200)

    def test_heic_cache_recovers_legacy_entries_after_filesystem_identity_change(self):
        from pillow_heif import from_pillow
        from unittest.mock import patch
        import hashlib
        heic=(self.folder/'memory.HEIC').resolve()
        from_pillow(Image.new('RGB',(90,60),'orange')).save(heic)
        old_id,stamp=server.identity(heic),server.signature(heic)
        legacy=server.CACHE/(hashlib.sha256((old_id+stamp).encode()).hexdigest()+'.jpg')
        Image.new('RGB',(90,60),'orange').save(legacy)
        with server.db() as conn:
            conn.execute('INSERT INTO photos(id,path,signature,size,rotation) VALUES (?,?,?,?,?)',(old_id,str(heic),stamp,.4,90))
        original_identity,original_open=server.identity,server.Image.open
        def without_heic_decode(path,*args,**kwargs):
            if isinstance(path,(str,Path)) and Path(path).suffix.lower() in server.HEIC:
                raise AssertionError('Cached HEIC must not be decoded again')
            return original_open(path,*args,**kwargs)
        with patch.object(server,'identity',side_effect=lambda p:'f'*24 if Path(p)==heic else original_identity(p)), patch.object(server.Image,'open',side_effect=without_heic_decode):
            result=self.scan()
            self.assertEqual(result.status_code,200)
            self.assertNotIn('needsConversion',result.json)
            self.assertEqual(server.converted_path(heic),legacy)
            self.assertEqual(server.photo(old_id)['size'],.4)
            self.assertEqual(server.photo(old_id)['rotation'],90)
        self.assertNotIn('needsConversion',self.scan().json)
        self.assertEqual(server.converted_path(heic),legacy)

    def test_heic_content_cache_reuses_copies_and_invalidates_changed_bytes(self):
        from pillow_heif import from_pillow
        from unittest.mock import patch
        import shutil
        heic=(self.folder/'memory.HEIC').resolve()
        from_pillow(Image.new('RGB',(90,60),'orange')).save(heic)
        self.client.post('/api/convert',json={'paths':[str(heic)]})
        self.scan()
        cached=server.converted_path(heic)
        copied=(self.folder/'copied.HEIC').resolve();shutil.copy2(heic,copied)
        original_open=server.Image.open
        def without_heic_decode(path,*args,**kwargs):
            if isinstance(path,(str,Path)) and Path(path).suffix.lower() in server.HEIC:
                raise AssertionError('Identical copied images must reuse the cached JPEG')
            return original_open(path,*args,**kwargs)
        with patch.object(server.Image,'open',side_effect=without_heic_decode):
            self.assertNotIn('needsConversion',self.scan().json)
            self.assertEqual(server.converted_path(copied),cached)
        stamp=heic.stat()
        os.utime(heic,ns=(stamp.st_atime_ns,stamp.st_mtime_ns+1))
        self.assertNotIn('needsConversion',self.scan().json)
        self.assertEqual(server.converted_path(heic),cached)
        # A replacement at the same path, even with identical size/mtime, cannot
        # borrow the previous contents' JPEG after the content index is present.
        original_stat=heic.stat()
        replacement=self.folder/'replacement.HEIC'
        replacement.write_bytes(bytes([heic.read_bytes()[0]^1])+heic.read_bytes()[1:])
        os.utime(replacement,ns=(original_stat.st_atime_ns,original_stat.st_mtime_ns))
        replacement.replace(heic)
        result=self.scan().json
        self.assertEqual(result['needsConversion'],[str(heic)])
        self.assertFalse(server.converted_path(heic).exists())
        self.assertEqual(server.converted_path(copied),cached)

    def test_heic_conversion_during_import_uses_the_existing_transaction(self):
        from pillow_heif import from_pillow
        heic=(self.folder/'memory.HEIC').resolve()
        from_pillow(Image.new('RGB',(90,60),'orange')).save(heic)
        result=self.scan(convert=True)
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json['imported'],3)
        self.assertNotIn('needsConversion',self.scan().json)
        self.assertEqual(self.client.post('/api/portraits',json={'path':str(self.folder),'convert':True}).status_code,200)

    def test_foreground_mask_excludes_background_and_is_cached(self):
        from unittest.mock import patch
        import io
        self.scan()
        path=str(self.folder/'a.jpg')
        self.client.post('/api/target',json={'path':path})
        def cutout(image, directory):
            result=image.convert('RGBA')
            alpha=Image.new('L',image.size,0)
            alpha.paste(255,(0,0,image.width//2,image.height))
            result.putalpha(alpha)
            return result
        with patch.object(server.background,'ready',return_value=True), patch.object(server.background,'remove_background',side_effect=cutout) as remove:
            self.assertEqual(self.client.post('/api/target/options',json={'foreground':True}).status_code,200)
            result=self.client.post('/api/mosaic',json={'columns':12,'variety':.35}).json
            self.assertEqual(result['activeTiles'],60)
            self.assertEqual(sum(result['counts']),60)
            self.assertEqual(result['tiles'].count(-1),60)
            self.assertEqual(len(result['tiles']),120)
            self.assertTrue(result['backgroundUrl'].startswith('/api/backgrounds/'))
            with self.client.get(result['backgroundUrl']) as response:
                with Image.open(io.BytesIO(response.data)) as original:
                    self.assertEqual(original.mode,'RGB')
                    self.assertEqual(original.size,(100,80))
                    self.assertEqual(original.getpixel((99,0)),server.open_photo({'path':path,'rotation':0},False).getpixel((99,0)))
            with self.client.get(result['maskUrl']) as response:
                with Image.open(io.BytesIO(response.data)) as mask:
                    self.assertEqual(mask.getpixel((99,0))[3],0)
                    self.assertEqual(mask.getpixel((0,0))[3],255)
            self.client.post('/api/mosaic',json={'columns':12,'variety':.8})
            self.assertEqual(remove.call_count,1)
            self.assertTrue(self.client.get('/api/library').json['foreground'])
            self.assertEqual(self.client.post('/api/target/options',json={'mosaicRegion':'background'}).status_code,200)
            inverted=self.client.post('/api/mosaic',json={'columns':12}).json
            self.assertEqual(inverted['mosaicRegion'],'background')
            self.assertEqual(inverted['activeTiles'],60)
            self.assertEqual(sum(inverted['counts']),60)
            self.assertEqual([tile == -1 for tile in inverted['tiles']], [tile != -1 for tile in result['tiles']])
            self.assertEqual(inverted['maskUrl'],result['maskUrl'])
            self.assertEqual(remove.call_count,1)
            self.assertEqual(self.client.get('/api/library').json['mosaicRegion'],'background')
            self.client.post('/api/target/options',json={'foreground':False})
            full=self.client.post('/api/mosaic',json={'columns':12}).json
            self.assertEqual(full['activeTiles'],120)
            self.assertIsNone(full['maskUrl'])
            self.assertNotIn(-1,full['tiles'])
        self.assertEqual(self.client.post('/api/target/options',json={'mosaicRegion':'invalid'}).status_code,400)
        self.assertEqual(self.client.post('/api/target/options',json={'foreground':'true'}).status_code,400)
        with patch.object(server.background,'ready',return_value=False):
            self.assertEqual(self.client.post('/api/target/options',json={'foreground':True}).status_code,400)

    def test_png_export_is_saved_locally(self):
        import io
        output=io.BytesIO()
        Image.new('RGB',(100,100),'green').save(output,'PNG')
        result=self.client.post('/api/exports',data=output.getvalue(),content_type='image/png')
        self.assertEqual(result.status_code,200)
        self.assertEqual(Path(result.json['path']).read_bytes(),output.getvalue())
        with self.client.get(result.json['url']) as response:
            self.assertEqual(response.status_code,200)
            self.assertIn('attachment',response.headers['Content-Disposition'])
        self.assertEqual(self.client.post('/api/exports',data=b'bad').status_code,400)

    def test_target_generation_and_security(self):
        self.scan()
        self.assertEqual(self.client.post('/api/target',json={'path':str(self.folder/'a.jpg')}).status_code,200)
        response=self.client.post('/api/mosaic',json={'columns':12,'variety':.5,'seed':42})
        self.assertEqual(response.status_code,200)
        m=response.json
        self.assertEqual(len(m['tiles']),m['columns']*m['rows'])
        self.assertEqual(sum(m['counts']),len(m['tiles']))
        self.assertEqual(self.client.get('/api/library',headers={'Origin':'https://evil.example'}).status_code,403)
        self.assertEqual(self.client.get('/api/library',headers={'Host':'evil.example'}).status_code,403)
        self.assertEqual(self.client.patch('/api/photos/'+m['ids'][0],json={'size':0}).status_code,400)
        self.assertEqual(self.client.post('/api/mosaic',json={'columns':999}).status_code,400)

if __name__=='__main__':
    unittest.main()
