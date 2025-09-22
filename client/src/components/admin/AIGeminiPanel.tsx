import React from 'react';
import { useQuery } from 'react-query';

const fetchGeminiPlan = async () => {
    const response = await fetch('/api/ai/gemini/plan');
    if (!response.ok) {
        throw new Error('Network response was not ok');
    }
    return response.json();
};

const AIGeminiPanel: React.FC = () => {
    const { data, error, isLoading } = useQuery('geminiPlan', fetchGeminiPlan);

    return (
        <div className="p-4 border rounded shadow">
            <h2 className="text-lg font-semibold mb-4">Gemini Plan Validation</h2>
            {isLoading && <p className="text-gray-500">Loading...</p>}
            {error && <p className="text-red-500">Error: {error.message}</p>}
            {data && (
                <div className="mt-4">
                    <h3 className="font-bold">Status: {data.status}</h3>
                    <p className="mt-2">Result: {data.result}</p>
                    <h4 className="mt-4 font-semibold">Feedback:</h4>
                    <pre className="bg-gray-100 p-2 rounded">{data.feedback}</pre>
                </div>
            )}
        </div>
    );
};

export default AIGeminiPanel;
