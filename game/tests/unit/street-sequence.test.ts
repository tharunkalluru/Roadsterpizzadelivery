import { describe, expect, it } from 'vitest';
import { streetSequence } from '../../src/ui/streetSequence';
import type { RoadEdge } from '../../src/world/schema';
import type { SurveyStorefront } from '../../src/world/streetSurveyTypes';

const road={id:'test-road',points:[[0,0],[100,0]],lengthM:100} as RoadEdge;
const front=(id:string,side:'left'|'right',alongRoadM:number,floor=0,roadId=road.id)=>({id,side,alongRoadM,floor,roadId}) as SurveyStorefront;

describe('shop sequence follows the viewed street side',()=>{
  it('reverses travel and swaps sides without reversing vertically stacked signs',()=>{
    const input=[front('north-east','left',80),front('south-ground','right',30),front('south-upper','right',30,2),front('south-west','right',10),front('north-west','left',20)];
    const forward=streetSequence(road,input);
    expect(forward.direction).toBe('east');
    expect(forward.sides[0].fronts.map(f=>f.id)).toEqual(['north-west','north-east']);
    const back=streetSequence(road,input,true);
    expect(back.direction).toBe('west');
    expect(back.sides[0].canonicalSide).toBe('right');
    expect(back.sides[0].fronts.map(f=>f.id)).toEqual(['south-ground','south-upper','south-west']);
    expect(back.sides[0].floors.map(f=>[f.floor,f.fronts.map(s=>s.id)])).toEqual([[0,['south-ground','south-west']],[2,['south-upper']]]);
    expect(back.sides[1].fronts.map(f=>f.id)).toEqual(['north-east','north-west']);
    expect(input[0].id).toBe('north-east');
  });

  it('keeps adjoining-road signs out of a side with no positioned frontage',()=>{
    const sequence=streetSequence({...road,points:[[0,0],[0,-100]]},[front('other-road','right',10,0,'adjacent-road'),front('upper','left',20,1)]);
    expect(sequence.direction).toBe('north');
    expect(sequence.sides[1].fronts).toEqual([]);
    expect(sequence.sides[0].fronts.map(f=>f.id)).toEqual(['upper']);
  });

  it('keeps upper-floor signs interleaved with ground-floor signs by street position',()=>{
    const input=[front('ground-first','left',10),front('upper-middle','left',20,1),front('ground-last','left',30)];
    const forward=streetSequence(road,input).sides.find(s=>s.canonicalSide==='left')!;
    const reverse=streetSequence(road,input,true).sides.find(s=>s.canonicalSide==='left')!;
    expect(forward.fronts.map(f=>f.id)).toEqual(['ground-first','upper-middle','ground-last']);
    expect(reverse.fronts.map(f=>f.id)).toEqual(['ground-last','upper-middle','ground-first']);
  });
});
