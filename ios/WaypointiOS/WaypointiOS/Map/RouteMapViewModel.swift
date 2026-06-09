import Foundation

@MainActor
@Observable
final class RouteMapViewModel {
    enum State {
        case idle
        case loading
        case unavailable(String)
        case loaded([MapRoute])
    }

    var state: State = .idle

    private let routeRepo = RouteRepository()

    func load(stage: Stage) {
        state = .loading
        do {
            guard
                let route = try routeRepo.findByStage(stageId: stage.id),
                let line = decodeLineString(route.geojson)
            else {
                state = .unavailable("Etapa zatím nemá uloženou trasu.")
                return
            }
            state = .loaded([
                MapRoute(
                    id: route.id,
                    line: line,
                    color: mapRouteColor(for: stage.difficultyClass),
                    title: stageDisplayTitle(stage: stage, line: line)
                ),
            ])
        } catch {
            state = .unavailable("Mapu se nepodařilo načíst.")
        }
    }

    func load(trailId: String, stages: [Stage], highlightedStageId: String? = nil) {
        state = .loading
        do {
            let stageById = Dictionary(uniqueKeysWithValues: stages.map { ($0.id, $0) })
            let routes = try routeRepo.findAllByTrail(trailId: trailId)
                .compactMap { route -> MapRoute? in
                    guard let line = decodeLineString(route.geojson) else { return nil }
                    let stage = route.stageId.flatMap { stageById[$0] }
                    let color: MapRouteColor = route.stageId == highlightedStageId
                        ? .selected
                        : mapRouteColor(for: stage?.difficultyClass)
                    return MapRoute(
                        id: route.id,
                        line: line,
                        color: color,
                        title: stage.map { stageDisplayTitle(stage: $0, line: line) }
                    )
                }

            state = routes.isEmpty
                ? .unavailable("Trasa zatím nemá uloženou geometrii.")
                : .loaded(routes)
        } catch {
            state = .unavailable("Mapu se nepodařilo načíst.")
        }
    }
}
