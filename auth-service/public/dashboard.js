const user_info = document.getElementById("user-info");
const profile_info = document.getElementById("profile-form");
async function loadProfile(id) {
    user_info.innerHTML = '<button id="create-btn" onclick="showFormProfile()">CREATE PROFILE</button>'
    // get data profile
    await fetch('http://localhost:3001/api/profile/' , {
        user_id : id,
    })
    displayProfile()
    
}

function displayProfile() {
    // render profile data
}

async function saveProfile() {
    const id =localStorage.getItem('user_id');
    const full_name = document.getElementById("full-name").value;
    const bio = document.getElementById("bio").value;
    const email = document.getElementById("email").value;
    
    const data = {
        user_id: id,
        full_name: full_name,
        bio: bio,
        email: email,
    }
    // save data profile
    await fetch('http://localhost:3001/api/profile/' , {
        method: 'POST',
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({data})
    })
}
function notProfile() {
    // render button create profile
}

function showFormProfile() {
    // save new data profile
    user_info.style.display = "none";
    profile_info.style.display = "block";
}

function displayUserInfo(id, name){
    user_info.innerHTML = 
        `<p>id: ${id}</p>
        <p>name: ${name}</p>`;
}

function exit() {
    localStorage.clear();
    window.location.href="/index.html";
}

window.onload = () => {
    const user_id =localStorage.getItem('user_id');
    const user_name =localStorage.getItem('user_name');
    displayUserInfo(user_id, user_name);
    loadProfile(user_id);
}