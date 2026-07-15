import {defineGame,compileCartridge} from '../src/index.mjs';
export const document={cards:[1,2,3,4,5,6,7,8,9],rounds:5};
export const game=defineGame({id:'ludotape/card-duel',version:'1.0.0',metadata:{title:'Seeded Card Duel'},
 initialState({document:d,rng}){const deck=[...d.cards];for(let i=deck.length-1;i;i--){const j=rng.int(i+1);[deck[i],deck[j]]=[deck[j],deck[i]]}return {deck,hand:deck.slice(0,3),cursor:3,score:0,round:0,last:null}},
 actions(s,{document:d}){return s.round>=d.rounds?[]:s.hand.map((value,index)=>({type:'play',index,value}))},
 transition(s,a,{rng}){const opponent=1+rng.int(9),score=s.score+(a.value>opponent?1:a.value<opponent?-1:0),hand=s.hand.filter((_,i)=>i!==a.index);let cursor=s.cursor;if(cursor<s.deck.length)hand.push(s.deck[cursor++]);return {...s,hand,cursor,score,round:s.round+1,last:{player:a.value,opponent}}},
 isGoal(s,{document:d}){return s.round===d.rounds&&s.score>0}, project(s){return {kind:'cards',hand:s.hand,score:s.score,round:s.round,last:s.last}}
});
export const cartridge=compileCartridge(game,document); export default cartridge;
