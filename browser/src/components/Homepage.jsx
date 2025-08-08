
const Homepage = () => {
  return (
    <div  className="main w-[100%] h-screen flex justify-center items-center  text-white">

        <div className="dashboard flex flex-col justify-center items-center gap-16">
                <div className="text-logo text-[3.4vw] font-bold">Vasudev</div>

                <div className="flex flex-col justify-center items-center">
                    <span className="text-logo text-[1vw] font-normal">Your Ai-powered web companion. </span>
                    <span className="text-logo text-[0.9vw] font-normal">Type , speak or show. </span>
                </div>

             <div className="search-div w-[30vw] h-[5vh] flex items-center justify-between rounded-[20px] bg-[#2d35928f]  text-[white] px-[3%] focus-within:scale-[0.96]  will-change-transform duration-[200ms]">

                <input type="text" className="search-input w-[90%] outline-0 " placeholder="Type to browse, ask Vasudev" />
                   <div className="flex items-center justify-center gap-3">
                     <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className="cursor-pointer hover:scale-[0.96]">
                    <path fill="#fff" d="M12 14q-1.25 0-2.125-.875T9 11V5q0-1.25.875-2.125T12 2t2.125.875T15 5v6q0 1.25-.875 2.125T12 14m-1 6v-2.075q-2.3-.325-3.937-1.95t-1.988-3.95q-.05-.425.225-.725T6 11t.713.288T7.1 12q.35 1.75 1.738 2.875T12 16q1.8 0 3.175-1.137T16.9 12q.1-.425.388-.712T18 11t.7.3t.225.725q-.35 2.275-1.975 3.925T13 17.925V20q0 .425-.288.713T12 21t-.712-.288T11 20" />
                    </svg>

                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className="cursor-pointer hover:scale-[0.96]">
                    <path fill="#fff" d="M12 17.5q1.875 0 3.188-1.312T16.5 13t-1.312-3.187T12 8.5T8.813 9.813T7.5 13t1.313 3.188T12 17.5m0-2q-1.05 0-1.775-.725T9.5 13t.725-1.775T12 10.5t1.775.725T14.5 13t-.725 1.775T12 15.5M4 21q-.825 0-1.412-.587T2 19V7q0-.825.588-1.412T4 5h3.15L8.4 3.65q.275-.3.663-.475T9.875 3h4.25q.425 0 .813.175t.662.475L16.85 5H20q.825 0 1.413.588T22 7v12q0 .825-.587 1.413T20 21zm0-2h16V7h-4.05l-1.825-2h-4.25L8.05 7H4zm8-6" />
                    </svg>
                   </div>
               </div>
        </div>
            
    </div>
  )
}

export default Homepage
