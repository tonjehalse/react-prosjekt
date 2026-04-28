import { useEffect, useMemo, useState } from "react";
import "./App.css";

const ENTUR_ENDPOINT = "https://api.entur.io/journey-planner/v3/graphql";

const STOP_PLACE_ID = "NSR:StopPlace:60890";

const CLIENT_NAME = "PT-infoboard";

// Hent de neste avgangene.
// timeRange er i sekunder: 7200 = neste 2 timer
const DEPARTURES_QUERY = `
  query Departures($stopId: String!) {
    stopPlace(id: $stopId) {
      id
      name
      estimatedCalls(numberOfDepartures: 30, timeRange: 7200) {
        realtime
        aimedDepartureTime
        expectedDepartureTime
        actualDepartureTime
        cancellation
        destinationDisplay {
          frontText
        }
        quay {
          name
          publicCode
        }
        serviceJourney {
          journeyPattern {
            line {
              id
              publicCode
              name
              transportMode
            }
          }
        }
        situations {
          summary {
            value
          }
        }
      }
    }
  }
`;

function getMinutesUntil(isoTime) {
  const departure = new Date(isoTime);
  const now = new Date();
  return Math.round((departure.getTime() - now.getTime()) / 60000);
}

function formatClock(isoTime) {
  return new Intl.DateTimeFormat("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoTime));
}

function formatDepartureText(isoTime) {
  const minutes = getMinutesUntil(isoTime);

  if (minutes <= 0) return "Nå";
  if (minutes === 1) return "1 min";
  if (minutes < 60) return `${minutes} min`;

  return formatClock(isoTime);
}

function App() {
  const [stopName, setStopName] = useState("");
  const [departures, setDepartures] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function fetchDepartures() {
    try {
      setError("");

      const response = await fetch(ENTUR_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ET-Client-Name": CLIENT_NAME,
        },
        body: JSON.stringify({
          query: DEPARTURES_QUERY,
          variables: {
            stopId: STOP_PLACE_ID,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Entur svarte med ${response.status}`);
      }

      const json = await response.json();

      if (json.errors) {
        throw new Error(json.errors[0]?.message ?? "Ukjent GraphQL-feil");
      }

      const stopPlace = json.data.stopPlace;

      if (!stopPlace) {
        throw new Error("Fant ikke holdeplassen. Sjekk STOP_PLACE_ID.");
      }

      const busDepartures = stopPlace.estimatedCalls
        .filter((call) => {
          const mode =
            call.serviceJourney?.journeyPattern?.line?.transportMode ?? "";

          // Beholder buss. Fjern denne filteren hvis du vil vise trikk/tog også.
          return mode.toLowerCase() === "bus";
        })
        .filter((call) => !call.cancellation)
        .map((call) => {
          const line = call.serviceJourney.journeyPattern.line;
          const departureTime =
            call.actualDepartureTime ??
            call.expectedDepartureTime ??
            call.aimedDepartureTime;

          return {
            id: `${line.id}-${departureTime}-${call.destinationDisplay?.frontText}`,
            line: line.publicCode,
            lineName: line.name,
            destination: call.destinationDisplay?.frontText ?? "Ukjent",
            departureTime,
            departureText: formatDepartureText(departureTime),
            clock: formatClock(departureTime),
            realtime: call.realtime,
            quay: call.quay?.publicCode ?? call.quay?.name ?? "",
            situation: call.situations?.[0]?.summary?.value ?? "",
          };
        });

      setStopName(stopPlace.name);
      setDepartures(busDepartures);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchDepartures();

    // Oppdater hvert 30. sekund.
    // Entur har rate limits, så ikke oppdater altfor ofte.
    const intervalId = setInterval(fetchDepartures, 30_000);

    return () => clearInterval(intervalId);
  }, []);

  const updatedText = useMemo(() => {
    if (!lastUpdated) return "";

    return new Intl.DateTimeFormat("nb-NO", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(lastUpdated);
  }, [lastUpdated]);

  return (
    <main className="board">
      <section className="top">
        <div>
          <p className="eyebrow">Entur live</p>
          <h1>{stopName || "Bussavganger"}</h1>
        </div>

        <div className="updated">
          <span>Sist oppdatert</span>
          <strong>{updatedText || "..."}</strong>
        </div>
      </section>

      {isLoading && <p className="message">Henter avganger...</p>}

      {error && (
        <div className="error">
          <strong>Noe gikk galt</strong>
          <p>{error}</p>
        </div>
      )}

      {!isLoading && !error && departures.length === 0 && (
        <p className="message">Fant ingen bussavganger de neste 2 timene.</p>
      )}

      {!error && departures.length > 0 && (
        <section className="departures">
          <div className="row header">
            <span>Linje</span>
            <span>Destinasjon</span>
            <span>Avgang</span>
            <span>Kl.</span>
            <span>Plattform</span>
          </div>

          {departures.map((departure) => (
            <div className="row" key={departure.id}>
              <span className="line">{departure.line}</span>

              <span className="destination">
                {departure.destination}
                {departure.situation && (
                  <small className="situation">{departure.situation}</small>
                )}
              </span>

              <span className="departure-time">
                {departure.departureText}
                {departure.realtime && <small>Sanntid</small>}
              </span>

              <span>{departure.clock}</span>

              <span>{departure.quay || "–"}</span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

export default App;