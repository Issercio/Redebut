let pokemon = [];

let draggedPokemon = null;

const nombrePokemon = 10;



// =================================
// LANCEMENT DU JEU
// =================================


async function chargerJeu(){


const liste =
document.getElementById("pokemon-list");



const zone =
document.getElementById("sort-zone");



if(!liste || !zone)
return;



liste.innerHTML =
"⏳ Chargement des Pokémon...";



zone.innerHTML =
"Dépose les Pokémon ici";





let ids=[];




while(ids.length < nombrePokemon){


let id =
Math.floor(Math.random()*1025)+1;



if(!ids.includes(id)){


ids.push(id);


}


}




pokemon=[];




for(let id of ids){



let response =
await fetch(

"https://pokeapi.co/api/v2/pokemon/"+id

);



let data =
await response.json();





pokemon.push({

nom:data.name,


taille:data.height / 10,


image:
data.sprites.other["official-artwork"].front_default


});



}




afficherPokemon();


}









// =================================
// CREATION DES CARTES
// =================================


function afficherPokemon(){



const liste =
document.getElementById("pokemon-list");



const zone =
document.getElementById("sort-zone");



liste.innerHTML="";

zone.innerHTML="";




pokemon
.sort(()=>Math.random()-0.5)
.forEach(p=>{



let carte =
document.createElement("div");



carte.className="pokemon";



carte.draggable=true;



carte.dataset.taille =
p.taille;





carte.innerHTML=`

<img src="${p.image}">


<h3>

${maj(p.nom)}

</h3>



<p class="taille hidden">

${p.taille} m

</p>


`;






// DRAG START


carte.addEventListener(

"dragstart",

()=>{


draggedPokemon=carte;


carte.style.opacity="0.5";


}

);







// DRAG END


carte.addEventListener(

"dragend",

()=>{


carte.style.opacity="1";


}

);





liste.appendChild(carte);



});







// Zone de dépôt


zone.addEventListener(

"dragover",

(e)=>{


e.preventDefault();



let after =
getDragAfterElement(
zone,
e.clientY
);





if(after==null){


zone.appendChild(
draggedPokemon
);



}

else{


zone.insertBefore(

draggedPokemon,

after

);



}



}

);



}









// =================================
// POSITION DROP
// =================================


function getDragAfterElement(container,y){



let elements =

[

...container.querySelectorAll(".pokemon")

];




return elements.reduce(

(closest,child)=>{


let box =
child.getBoundingClientRect();



let offset =

y - box.top - box.height / 2;





if(

offset < 0 &&

offset > closest.offset

){



return {


offset:offset,


element:child


};


}





return closest;



},


{


offset:Number.NEGATIVE_INFINITY


}



).element;



}









// =================================
// VERIFICATION
// =================================


function verifier(){



const zone =
document.getElementById("sort-zone");



let cartes =

[...zone.children];






if(cartes.length !== nombrePokemon){



afficherResultat(

"⚠️ Attention",

"Place tous les Pokémon avant de vérifier !",

"error"

);



return;


}






// Affiche les tailles


cartes.forEach(carte=>{


let taille =

carte.querySelector(".taille");



taille.classList.remove(
"hidden"
);


});







let tailles =

cartes.map(

carte =>

Number(carte.dataset.taille)

);






let correct=true;






for(

let i=0;

i<tailles.length-1;

i++

){



if(

tailles[i] > tailles[i+1]

){


correct=false;


}



}








if(correct){



ajouterScore();



afficherResultat(

"🎉 Bravo !",

"Classement réussi ! Nouveaux Pokémon dans quelques secondes.",

"success"

);




}



else{



afficherResultat(

"❌ Raté !",

"Le classement est incorrect. Une nouvelle série arrive !",

"error"

);



}






// Nouvelle partie dans les deux cas


setTimeout(()=>{


nouvellePartie();



},2500);





}









// =================================
// RESULTAT
// =================================


function afficherResultat(

titre,

message,

type

){



let box =

document.getElementById(
"result-box"
);



if(!box)
return;




let title =

document.getElementById(
"result-title"
);




let text =

document.getElementById(
"result-text"
);





box.className =
"result "+type;




title.innerHTML=titre;


text.innerHTML=message;



}









// =================================
// NOUVELLE PARTIE
// =================================


function nouvellePartie(){



let box =

document.getElementById(
"result-box"
);




if(box){


box.className=
"result hidden-box";


}





chargerJeu();



}









// =================================
// SCORE
// =================================


function ajouterScore(){



let score =

Number(

localStorage.getItem("score") || 0

);





localStorage.setItem(

"score",

score+100

);



}








// =================================
// MAJUSCULE
// =================================


function maj(text){



return text.charAt(0).toUpperCase()

+

text.slice(1);



}