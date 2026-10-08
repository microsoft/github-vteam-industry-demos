export async function submitClaim(request) {
    const response = await fetch("/api/claims", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
    });

    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Claim submission failed with HTTP ${response.status}.`);
    }

    return await response.json();
}
