const token = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImNtcHdyNWEzOTAwMDIzdm9wNTJ4a2d6ejAiLCJlbWFpbCI6IjIyMzc2MDg2MDJAcXEuY29tIiwicm9sZSI6IlNVUEVSX0FETUlOIiwic2Vzc2lvbklkIjoidGVzdC1zZXNzaW9uLWlkIiwidXNlciI6eyJpZCI6ImNtcHdyNWEzOTAwMDIzdm9wNTJ4a2d6ejAiLCJlbWFpbCI6IjIyMzc2MDg2MDJAcXEuY29tIiwicm9sZSI6IlNVUEVSX0FETUlOIn0sImV4cGlyZXMiOiIyMDI2LTA2LTE1VDA5OjA5OjA3LjYxOFoiLCJpYXQiOjE3ODA5MDk3NDcsImV4cCI6MTc4MTUxNDU0N30.BwFV7Cwb0u5vGWk5-OTv-CMjPGklc2kRFVqoASKXgXc";

async function run() {
  const url = "http://localhost:3000/api/orders?page=1&pageSize=50&_metrics=1";
  console.log(`Sending GET request to ${url}...`);
  const startTime = Date.now();
  
  try {
    const res = await fetch(url, {
      headers: {
        "Cookie": `session=${token}`
      }
    });
    
    const endTime = Date.now();
    console.log(`\nHTTP Status: ${res.status} (${res.statusText})`);
    console.log(`Response Time: ${endTime - startTime}ms`);
    
    const text = await res.text();
    console.log(`Response Size: ${text.length} bytes`);
    
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.log("Response is not JSON! Raw body snippet:");
      console.log(text.slice(0, 1000));
      return;
    }
    
    if (res.ok) {
      console.log("\nSuccess! Data summary:");
      console.log(`- Total orders (meta.total): ${data.meta?.total}`);
      console.log(`- Returned items count: ${data.items?.length}`);
      console.log("- Filters - Platforms:", data.filters?.platforms);
      console.log("- Filters - Statuses:", data.filters?.statuses);
      console.log("- Summary (receivedAmount, etc.):", data.summary);
      console.log("- Overview (totalCount, etc.):", data.overview);
      
      if (data.items && data.items.length > 0) {
        console.log("\nFirst order info:");
        console.log(`  ID: ${data.items[0].id}`);
        console.log(`  Order No: ${data.items[0].orderNo}`);
        console.log(`  Platform: ${data.items[0].platform}`);
        console.log(`  Status: ${data.items[0].status}`);
        console.log(`  Items count: ${data.items[0].items?.length}`);
      }
    } else {
      console.log("\nServer returned error details:", data);
    }
  } catch (err) {
    console.error("\nNetwork/Fetch error:", err);
  }
}

run();
