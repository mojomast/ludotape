import {defineGame,compileCartridge} from '../src/index.mjs';
export const document={width:5,height:5,walls:[[0,0],[1,0],[2,0],[3,0],[4,0],[0,1],[4,1],[0,2],[4,2],[0,3],[4,3],[0,4],[1,4],[2,4],[3,4],[4,4]],player:[1,1],crates:[[2,2]],goals:[[3,2]]};
const key=([x,y])=>`${x},${y}`, dirs={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
export const game=defineGame({id:'ludotape/warehouse-circuit',version:'1.0.0',metadata:{title:'Warehouse Circuit'},
 initialState({document:d}){return {player:d.player,crates:d.crates,moves:0}},
 actions(state,{document:d}){const walls=new Set(d.walls.map(key)),crates=new Set(state.crates.map(key)),out=[];for(const [direction,[dx,dy]] of Object.entries(dirs)){const p=[state.player[0]+dx,state.player[1]+dy];if(walls.has(key(p)))continue;if(crates.has(key(p))){const beyond=[p[0]+dx,p[1]+dy];if(walls.has(key(beyond))||crates.has(key(beyond)))continue}out.push({type:'move',direction})}return out},
 transition(state,action){const [dx,dy]=dirs[action.direction],p=[state.player[0]+dx,state.player[1]+dy],crates=state.crates.map(c=>c[0]===p[0]&&c[1]===p[1]?[c[0]+dx,c[1]+dy]:c);return {player:p,crates,moves:state.moves+1}},
 isGoal(state,{document:d}){const goals=new Set(d.goals.map(key));return state.crates.every(c=>goals.has(key(c)))},
 project(state,{document:d}){return {kind:'grid',width:d.width,height:d.height,walls:d.walls,goals:d.goals,...state}}
});
export const cartridge=compileCartridge(game,document); export default cartridge;
