import { Duration } from "luxon";
import * as React from "react";

class ReadableDuration extends React.Component<any,  any> {
  public render() {
    const durationInMs = Duration.fromMillis(this.props.durationInMs);
    const duration = durationInMs.shiftTo("days", "hours", "minutes", "seconds");

    return (
      <div style={this.props.style}>
        {
          duration.days > 0
          &&
          <span>
            <span
              style={{
                fontSize: "28px",
              }}
            >
              {Duration.fromObject({ days: duration.days }).toFormat("d")}
            </span>
            d
            {" "}
          </span>
        }
        {
          duration.hours > 0
          &&
          <span>
            <span
              style={{
                fontSize: "28px",
              }}
            >
              {Duration.fromObject({ hours: duration.hours }).toFormat("h")}
            </span>
            h
            {" "}
          </span>
        }
        {
          duration.minutes > 0 && !(duration.minutes === 1  && duration.seconds === 0)
          &&
          <span>
            <span
              style={{
                fontSize: "28px",
              }}
            >
              {Duration.fromObject({ minutes: duration.minutes }).toFormat("mm")}
            </span>
            m
            {" "}
          </span>
        }
        <span
          style={{
            fontSize: "28px",
          }}
        >
          {
            duration.minutes === 1  && duration.seconds === 0
            ?
            Duration.fromObject({ seconds: 60 }).toFormat("ss")
            :
            Duration.fromObject({ seconds: duration.seconds }).toFormat("ss")
          }
        </span>
        s
      </div>
    );
  }
}

export { ReadableDuration };