export async function runWorkflow(request) {
    const response = await fetch("/api/workflow", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
    });

    if (!response.ok) {
        const problem = await response.json().catch(() => null);
        throw new Error(problem?.detail || `Workflow failed with HTTP ${response.status}.`);
    }

    return await response.json();
}
